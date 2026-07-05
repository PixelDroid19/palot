import {
	type AgentAdapter,
	type AgentUpdate,
	asRecord,
	readNumber,
	readString,
} from "./types"

/**
 * Claude Code (`claude -p --output-format json`) adapter. In print mode Claude
 * emits a single JSON result object: `{ type: "result", result, session_id,
 * is_error, usage: { input_tokens, output_tokens, cache_read_input_tokens, … } }`.
 * We also tolerate `assistant` events so a future switch to `stream-json` keeps
 * working.
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

	if (event.type === "result") {
		if (event.is_error === true) {
			return [{ kind: "notice", text: readString(event.result) || "Claude reported an error" }]
		}
		// A single result line carries both the answer and the usage.
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

	if (event.type === "system" && typeof event.session_id === "string") {
		return [{ kind: "thread", threadId: event.session_id }]
	}

	return [{ kind: "unknown", raw: parsed }]
}

export const claudeAdapter: AgentAdapter = {
	id: "claude",
	displayName: "Claude Code",
	binary: "claude",
	buildArgs: (opts) => {
		// Claude runs in the process cwd (set by the runner); it has no -C flag.
		const args = ["-p", "--output-format", "json"]
		// Resume a prior conversation by session id to keep multi-turn context.
		if (opts.resumeId) args.push("--resume", opts.resumeId)
		if (opts.model) args.push("--model", opts.model)
		// Only loosen permissions when the user opts out of read-only.
		if (opts.sandbox && opts.sandbox !== "read-only") {
			args.push("--dangerously-skip-permissions")
		}
		args.push(opts.prompt)
		return args
	},
	parseLine: parseClaudeLine,
}
