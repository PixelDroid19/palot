import {
	type AgentAdapter,
	type AgentModelInfo,
	type AgentUpdate,
	asRecord,
	readNumber,
	readString,
} from "../types"

/**
 * Claude Code adapter, driven with `claude -p --output-format stream-json
 * --verbose --include-partial-messages` so text and thinking stream
 * token-by-token instead of arriving as whole blocks. The stream emits:
 *
 *   {type:"system", subtype:"init", session_id}
 *   {type:"stream_event", event:{type:"content_block_start"|"content_block_delta"|…}}
 *   {type:"assistant", message:{content:[{type:"text"|"thinking"|"tool_use", …}]}}
 *   {type:"user", message:{content:[{type:"tool_result", …}]}}   (tool results)
 *   {type:"result", subtype:"success"|…, result, session_id, is_error, usage}
 *
 * Streaming text/thinking comes from `stream_event` deltas; the `assistant`
 * echo of each completed block is used only for tool_use (its text/thinking
 * already streamed, and the final `result` line stays authoritative for the
 * answer). Events with a `parent_tool_use_id` belong to subagents (Task tool)
 * and are skipped so nested output can't pollute the top-level answer.
 *
 * The prompt is delivered on stdin (argv has length limits and quoting
 * hazards).
 */

const TOOL_RESULT_MAX_CHARS = 4_000

function parseUsage(raw: Record<string, unknown>) {
	const details = asRecord(raw.output_tokens_details)
	return {
		inputTokens: readNumber(raw.input_tokens),
		cachedInputTokens: readNumber(raw.cache_read_input_tokens),
		outputTokens: readNumber(raw.output_tokens),
		reasoningOutputTokens: readNumber(details?.thinking_tokens),
	}
}

/** Best human-readable one-liner for a tool invocation's input. */
function toolDetail(input: Record<string, unknown> | null): string | undefined {
	if (!input) return undefined
	return (
		readString(input.command) ||
		readString(input.description) ||
		readString(input.file_path) ||
		readString(input.pattern) ||
		readString(input.query) ||
		readString(input.url) ||
		readString(input.prompt).slice(0, 200) ||
		undefined
	)
}

function parseStreamEvent(event: Record<string, unknown>): AgentUpdate[] {
	const inner = asRecord(event.event)
	if (!inner) return []
	switch (inner.type) {
		case "content_block_start": {
			// Paragraph break between successive blocks of the same kind; the UI
			// trims leading whitespace so the first block renders clean.
			const block = asRecord(inner.content_block)
			if (block?.type === "text") return [{ kind: "message-delta", text: "\n\n" }]
			if (block?.type === "thinking") return [{ kind: "reasoning-delta", text: "\n\n" }]
			return []
		}
		case "content_block_delta": {
			const delta = asRecord(inner.delta)
			if (!delta) return []
			if (delta.type === "text_delta" && readString(delta.text)) {
				return [{ kind: "message-delta", text: readString(delta.text) }]
			}
			if (delta.type === "thinking_delta" && readString(delta.thinking)) {
				return [{ kind: "reasoning-delta", text: readString(delta.thinking) }]
			}
			return []
		}
		default:
			return []
	}
}

export function parseClaudeLine(line: string): AgentUpdate[] {
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

	// Subagent (Task tool) traffic — skip so it can't pollute the main answer.
	if (readString(event.parent_tool_use_id)) return []

	switch (event.type) {
		case "system": {
			if (event.subtype !== "init") return []
			const threadId = readString(event.session_id)
			return threadId ? [{ kind: "thread", threadId }] : []
		}
		case "stream_event":
			return parseStreamEvent(event)
		case "assistant": {
			// Text/thinking already streamed via stream_event; only surface tools.
			const message = asRecord(event.message)
			const content = Array.isArray(message?.content) ? message.content : []
			const updates: AgentUpdate[] = []
			for (const block of content) {
				const item = asRecord(block)
				if (item?.type !== "tool_use") continue
				updates.push({
					kind: "tool",
					id: readString(item.id) || undefined,
					name: readString(item.name) || "tool",
					detail: toolDetail(asRecord(item.input)),
					status: "running",
				})
			}
			return updates
		}
		case "user": {
			// Tool results: close out the matching tool_use by id.
			const message = asRecord(event.message)
			const content = Array.isArray(message?.content) ? message.content : []
			const updates: AgentUpdate[] = []
			for (const block of content) {
				const item = asRecord(block)
				if (item?.type !== "tool_result") continue
				const id = readString(item.tool_use_id)
				if (!id) continue
				const text = Array.isArray(item.content)
					? item.content
							.map((c) => readString(asRecord(c)?.text))
							.filter(Boolean)
							.join("\n")
					: readString(item.content)
				updates.push({
					kind: "tool",
					id,
					name: "tool",
					status: item.is_error === true ? "error" : "completed",
					output: text.slice(0, TOOL_RESULT_MAX_CHARS) || undefined,
				})
			}
			return updates
		}
		case "rate_limit_event":
			return []
		case "result": {
			if (event.is_error === true) {
				return [{ kind: "notice", text: readString(event.result) || "Claude reported an error" }]
			}
			const updates: AgentUpdate[] = []
			if (typeof event.session_id === "string") {
				updates.push({ kind: "thread", threadId: event.session_id })
			}
			const text = readString(event.result)
			if (text) updates.push({ kind: "message", text })
			const usage = asRecord(event.usage)
			if (usage) updates.push({ kind: "usage", usage: parseUsage(usage) })
			return updates
		}
		default:
			return [{ kind: "unknown", raw: parsed }]
	}
}

/**
 * Claude Code has no on-disk model catalog; it accepts stable aliases that
 * always point at the latest model of each family (per `claude --help`).
 * Reasoning effort is a session-level flag (`--effort low…max`) available on
 * every model.
 */
const CLAUDE_EFFORTS = ["low", "medium", "high", "xhigh", "max"]
const CLAUDE_MODELS: AgentModelInfo[] = [
	{ slug: "", label: "Default", efforts: CLAUDE_EFFORTS },
	{ slug: "fable", label: "Fable", efforts: CLAUDE_EFFORTS },
	{ slug: "opus", label: "Opus", efforts: CLAUDE_EFFORTS },
	{ slug: "sonnet", label: "Sonnet", efforts: CLAUDE_EFFORTS },
	{ slug: "haiku", label: "Haiku", efforts: CLAUDE_EFFORTS },
]

export const claudeAdapter: AgentAdapter = {
	id: "claude",
	displayName: "Claude Code",
	binary: "claude",
	capabilities: { imageInput: true, reasoningEffort: true, resume: true },
	listModels: async () => CLAUDE_MODELS,
	buildCommand: (opts) => {
		// Claude runs in the process cwd (set by the runner); it has no -C flag.
		const args = ["-p", "--output-format", "stream-json", "--verbose", "--include-partial-messages"]
		// Resume a prior conversation by session id to keep multi-turn context.
		if (opts.resumeId) args.push("--resume", opts.resumeId)
		if (opts.model) args.push("--model", opts.model)
		if (opts.reasoningEffort) args.push("--effort", opts.reasoningEffort)
		// Sandbox mapping. Claude has no OS sandbox in print mode; permission
		// modes are the closest control: read-only = default (headless runs deny
		// permission prompts, so writes/commands fail while reads work),
		// workspace-write = acceptEdits (file edits auto-approved, arbitrary
		// commands still denied), full access = skip permissions entirely.
		if (opts.sandbox === "workspace-write") {
			args.push("--permission-mode", "acceptEdits")
		} else if (opts.sandbox === "danger-full-access") {
			args.push("--dangerously-skip-permissions")
		}
		if (opts.bridge) {
			// Expose the Palot bridge as an MCP server so Claude can delegate to
			// other agents (palot_delegate) and use shared context (palot_context_*).
			const mcpConfig = {
				mcpServers: {
					palot: {
						command: opts.bridge.nodeBinary,
						args: [opts.bridge.proxyScriptPath],
						env: {
							...opts.bridge.proxyEnv,
							PALOT_BRIDGE_URL: opts.bridge.url,
							PALOT_BRIDGE_TOKEN: opts.bridge.token,
						},
					},
				},
			}
			args.push("--mcp-config", JSON.stringify(mcpConfig))
		}
		// Claude's print mode has no image flag, but its Read tool (allowed by
		// default headlessly) renders image files — so attachments are passed as
		// file paths the model is told to read.
		let prompt = opts.prompt
		if (opts.images?.length) {
			prompt += `\n\nThe user attached the following image file(s). Read them with the Read tool before answering:\n${opts.images.map((p) => `- ${p}`).join("\n")}`
		}
		return { args, stdin: prompt }
	},
	parseLine: parseClaudeLine,
}
