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
 * --verbose` so answers stream incrementally instead of arriving as one blob
 * at exit (the old `json` mode looked hung on long tasks). The stream emits:
 *
 *   {type:"system", subtype:"init", session_id}
 *   {type:"assistant", message:{content:[{type:"text"|"tool_use", …}]}}
 *   {type:"result", subtype:"success"|…, result, session_id, is_error, usage}
 *
 * The prompt is delivered on stdin (argv has length limits and quoting
 * hazards). The final `result` line remains authoritative for the answer.
 */

function parseUsage(raw: Record<string, unknown>) {
	return {
		inputTokens: readNumber(raw.input_tokens),
		cachedInputTokens: readNumber(raw.cache_read_input_tokens),
		outputTokens: readNumber(raw.output_tokens),
		reasoningOutputTokens: 0,
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

	switch (event.type) {
		case "system": {
			const threadId = readString(event.session_id)
			return threadId ? [{ kind: "thread", threadId }] : []
		}
		case "assistant": {
			// Intermediate assistant turns: stream text as deltas, surface tool use.
			const message = asRecord(event.message)
			const content = Array.isArray(message?.content) ? message.content : []
			const updates: AgentUpdate[] = []
			for (const block of content) {
				const item = asRecord(block)
				if (!item) continue
				if (item.type === "text" && readString(item.text)) {
					updates.push({ kind: "message-delta", text: readString(item.text) })
				} else if (item.type === "thinking" && readString(item.thinking)) {
					updates.push({ kind: "reasoning", text: readString(item.thinking) })
				} else if (item.type === "tool_use") {
					updates.push({ kind: "tool", name: readString(item.name) || "tool" })
				}
			}
			return updates
		}
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
 */
const CLAUDE_MODELS: AgentModelInfo[] = [
	{ slug: "", label: "Default", efforts: [] },
	{ slug: "fable", label: "Fable", efforts: [] },
	{ slug: "opus", label: "Opus", efforts: [] },
	{ slug: "sonnet", label: "Sonnet", efforts: [] },
	{ slug: "haiku", label: "Haiku", efforts: [] },
]

export const claudeAdapter: AgentAdapter = {
	id: "claude",
	displayName: "Claude Code",
	binary: "claude",
	capabilities: { imageInput: true, reasoningEffort: false, resume: true },
	listModels: async () => CLAUDE_MODELS,
	buildCommand: (opts) => {
		// Claude runs in the process cwd (set by the runner); it has no -C flag.
		const args = ["-p", "--output-format", "stream-json", "--verbose"]
		// Resume a prior conversation by session id to keep multi-turn context.
		if (opts.resumeId) args.push("--resume", opts.resumeId)
		if (opts.model) args.push("--model", opts.model)
		// Only loosen permissions when the user opts out of read-only.
		if (opts.sandbox && opts.sandbox !== "read-only") {
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
