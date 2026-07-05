import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import {
	type AgentAdapter,
	type AgentModelInfo,
	type AgentRunOptions,
	type AgentUpdate,
	asRecord,
	readNumber,
	readString,
} from "../types"

/**
 * Codex (`codex exec --json`) adapter. Emits a JSONL event stream:
 *   thread.started · turn.started · item.started/item.updated/item.completed
 *   {agent_message|reasoning|command_execution|file_change|mcp_tool_call|
 *    web_search|todo_list|error} · turn.completed{usage} · turn.failed{error}
 * Unknown event types are surfaced generically so a version bump can't
 * silently break the runner. The prompt is delivered on stdin (`-`).
 */

function parseUsage(raw: Record<string, unknown>) {
	return {
		inputTokens: readNumber(raw.input_tokens),
		cachedInputTokens: readNumber(raw.cached_input_tokens),
		outputTokens: readNumber(raw.output_tokens),
		reasoningOutputTokens: readNumber(raw.reasoning_output_tokens),
	}
}

const TOOL_OUTPUT_MAX_CHARS = 4_000

/** Normalize one thread item into a tool/message/reasoning update. */
function parseItem(
	item: Record<string, unknown>,
	phase: "started" | "updated" | "completed",
	raw: unknown,
): AgentUpdate[] {
	const id = readString(item.id) || undefined
	const status =
		phase === "completed"
			? item.status === "failed" || readNumber(item.exit_code) !== 0
				? ("error" as const)
				: ("completed" as const)
			: ("running" as const)
	switch (item.type) {
		case "agent_message":
			// Only the completed item is authoritative; started/updated echoes of a
			// growing message would duplicate text.
			return phase === "completed" ? [{ kind: "message", text: readString(item.text) }] : []
		case "reasoning":
			return phase === "completed" ? [{ kind: "reasoning", text: readString(item.text) }] : []
		case "command_execution":
			return [
				{
					kind: "tool",
					id,
					name: "shell",
					detail: readString(item.command),
					status,
					output:
						phase === "completed"
							? readString(item.aggregated_output).slice(0, TOOL_OUTPUT_MAX_CHARS) || undefined
							: undefined,
				},
			]
		case "file_change": {
			const changes = Array.isArray(item.changes) ? item.changes : []
			const paths = changes
				.map((c) => readString(asRecord(c)?.path))
				.filter(Boolean)
				.join(", ")
			return [{ kind: "tool", id, name: "edit", detail: paths || undefined, status }]
		}
		case "mcp_tool_call": {
			const server = readString(item.server)
			const tool = readString(item.tool)
			return [{ kind: "tool", id, name: server && tool ? `${server}.${tool}` : "mcp", status }]
		}
		case "web_search":
			return [{ kind: "tool", id, name: "web_search", detail: readString(item.query), status }]
		case "todo_list":
			// Plan bookkeeping — not worth a tool card per update.
			return []
		case "error":
			return [{ kind: "notice", text: readString(item.message) }]
		default:
			return phase === "completed" ? [{ kind: "unknown", raw }] : []
	}
}

export function parseCodexLine(line: string): AgentUpdate[] {
	const trimmed = line.trim()
	if (!trimmed) return []

	let parsed: unknown
	try {
		parsed = JSON.parse(trimmed)
	} catch {
		return []
	}

	const event = asRecord(parsed)
	if (!event) return []

	switch (event.type) {
		case "thread.started":
			return [{ kind: "thread", threadId: readString(event.thread_id) }]
		case "turn.started":
			return []
		case "turn.completed": {
			const usage = asRecord(event.usage)
			return usage
				? [{ kind: "usage", usage: parseUsage(usage) }]
				: [{ kind: "unknown", raw: parsed }]
		}
		case "turn.failed": {
			const error = asRecord(event.error)
			return [{ kind: "notice", text: readString(error?.message) || "Codex turn failed" }]
		}
		case "item.started":
		case "item.updated":
		case "item.completed": {
			const item = asRecord(event.item)
			if (!item) return [{ kind: "unknown", raw: parsed }]
			const phase = event.type.slice("item.".length) as "started" | "updated" | "completed"
			return parseItem(item, phase, parsed)
		}
		default:
			return [{ kind: "unknown", raw: parsed }]
	}
}

/**
 * `-c` overrides wiring the Palot bridge in as an MCP server. Only injected
 * for full-access runs: `codex exec` auto-cancels MCP tool calls in sandboxed
 * mode because the approval prompt can't be answered headlessly (stdin EOF →
 * "user cancelled MCP tool call"; openai/codex#24135). Full-access runs use
 * `--dangerously-bypass-approvals-and-sandbox`, where tool calls go through.
 */
function bridgeOverrides(opts: AgentRunOptions): string[] {
	if (!opts.bridge || opts.sandbox !== "danger-full-access") return []
	const { nodeBinary, proxyScriptPath, url, token, proxyEnv } = opts.bridge
	const env = { ...proxyEnv, PALOT_BRIDGE_URL: url, PALOT_BRIDGE_TOKEN: token }
	const envTable = Object.entries(env)
		.map(([key, value]) => `${key}=${JSON.stringify(value)}`)
		.join(",")
	return [
		"-c",
		`mcp_servers.palot.command=${JSON.stringify(nodeBinary)}`,
		"-c",
		`mcp_servers.palot.args=[${JSON.stringify(proxyScriptPath)}]`,
		"-c",
		`mcp_servers.palot.env={${envTable}}`,
	]
}

/** Fallback catalog when the CLI's models cache is missing or unreadable. */
const CODEX_EFFORTS = ["low", "medium", "high", "xhigh"]
const CODEX_FALLBACK_MODELS: AgentModelInfo[] = [
	{ slug: "", label: "Default", efforts: CODEX_EFFORTS, defaultEffort: "medium" },
	{ slug: "gpt-5.5", label: "GPT-5.5", efforts: CODEX_EFFORTS, defaultEffort: "medium" },
	{ slug: "gpt-5.4", label: "GPT-5.4", efforts: CODEX_EFFORTS, defaultEffort: "medium" },
]

/**
 * Codex keeps a models catalog on disk (`~/.codex/models_cache.json`) that its
 * own picker uses — the authoritative, always-current source. Entries with
 * visibility other than "list" are internal and skipped.
 */
async function listCodexModels(): Promise<AgentModelInfo[]> {
	try {
		const raw = await readFile(join(homedir(), ".codex", "models_cache.json"), "utf8")
		const cache = asRecord(JSON.parse(raw))
		const entries = Array.isArray(cache?.models) ? cache.models : []
		const models: AgentModelInfo[] = []
		for (const entry of entries) {
			const model = asRecord(entry)
			if (!model) continue
			if (model.visibility != null && model.visibility !== "list") continue
			const slug = readString(model.slug)
			if (!slug) continue
			const levels = Array.isArray(model.supported_reasoning_levels)
				? model.supported_reasoning_levels
						.map((l) => readString(asRecord(l)?.effort))
						.filter(Boolean)
				: []
			models.push({
				slug,
				label: readString(model.display_name) || slug,
				efforts: levels,
				defaultEffort: readString(model.default_reasoning_level) || undefined,
			})
		}
		if (!models.length) return CODEX_FALLBACK_MODELS
		return [
			{ slug: "", label: "Default", efforts: CODEX_EFFORTS, defaultEffort: "medium" },
			...models,
		]
	} catch {
		return CODEX_FALLBACK_MODELS
	}
}

export const codexAdapter: AgentAdapter = {
	id: "codex",
	displayName: "Codex",
	binary: "codex",
	capabilities: { imageInput: true, reasoningEffort: true, resume: true },
	listModels: listCodexModels,
	buildCommand: (opts) => {
		// The bypass flag (not `-s danger-full-access`) so MCP tool calls aren't
		// auto-cancelled by the unanswerable approval prompt. `exec resume` has
		// no `-s`, so sandbox changes there go through `-c sandbox_mode`.
		const fullAccess = opts.sandbox === "danger-full-access"
		const args = opts.resumeId
			? [
					"exec",
					"resume",
					opts.resumeId,
					"--json",
					"--skip-git-repo-check",
					...(fullAccess
						? ["--dangerously-bypass-approvals-and-sandbox"]
						: ["-c", `sandbox_mode=${JSON.stringify(opts.sandbox ?? "read-only")}`]),
				]
			: [
					"exec",
					"--json",
					"--skip-git-repo-check",
					...(fullAccess
						? ["--dangerously-bypass-approvals-and-sandbox"]
						: ["-s", opts.sandbox ?? "read-only"]),
					"-C",
					opts.cwd,
				]
		if (opts.model) args.push("-c", `model=${JSON.stringify(opts.model)}`)
		if (opts.reasoningEffort)
			args.push("-c", `model_reasoning_effort=${JSON.stringify(opts.reasoningEffort)}`)
		for (const image of opts.images ?? []) args.push("-i", image)
		args.push(...bridgeOverrides(opts))
		// "-" reads the prompt from stdin.
		args.push("-")
		return { args, stdin: opts.prompt }
	},
	parseLine: parseCodexLine,
}
