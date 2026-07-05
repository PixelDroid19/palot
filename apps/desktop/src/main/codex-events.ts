/**
 * Pure parsing of the JSONL event stream emitted by `codex exec --json`.
 *
 * The stream is a sequence of newline-delimited JSON objects. We model only the
 * fields we act on and tolerate everything else (unknown event or item types
 * are surfaced generically rather than dropped), so a Codex version bump can't
 * silently break the runner.
 */

export interface CodexUsage {
	inputTokens: number
	cachedInputTokens: number
	outputTokens: number
	reasoningOutputTokens: number
}

/** A normalized, UI-friendly update derived from one or more raw events. */
export type CodexUpdate =
	| { kind: "thread"; threadId: string }
	| { kind: "message"; text: string }
	| { kind: "reasoning"; text: string }
	| { kind: "notice"; text: string }
	| { kind: "usage"; usage: CodexUsage }
	| { kind: "unknown"; raw: unknown }

function asRecord(value: unknown): Record<string, unknown> | null {
	return value != null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null
}

function str(value: unknown): string {
	return typeof value === "string" ? value : ""
}

function num(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function parseUsage(raw: Record<string, unknown>): CodexUsage {
	return {
		inputTokens: num(raw.input_tokens),
		cachedInputTokens: num(raw.cached_input_tokens),
		outputTokens: num(raw.output_tokens),
		reasoningOutputTokens: num(raw.reasoning_output_tokens),
	}
}

/**
 * Parse one JSONL line into a normalized update, or `null` when the line is
 * blank or not valid JSON (both are expected and non-fatal).
 */
export function parseCodexLine(line: string): CodexUpdate | null {
	const trimmed = line.trim()
	if (!trimmed) return null

	let parsed: unknown
	try {
		parsed = JSON.parse(trimmed)
	} catch {
		return null
	}

	const event = asRecord(parsed)
	if (!event) return null

	switch (event.type) {
		case "thread.started":
			return { kind: "thread", threadId: str(event.thread_id) }
		case "turn.completed": {
			const usage = asRecord(event.usage)
			return usage ? { kind: "usage", usage: parseUsage(usage) } : { kind: "unknown", raw: parsed }
		}
		case "item.completed": {
			const item = asRecord(event.item)
			if (!item) return { kind: "unknown", raw: parsed }
			switch (item.type) {
				case "agent_message":
					return { kind: "message", text: str(item.text) }
				case "reasoning":
					return { kind: "reasoning", text: str(item.text) }
				case "error":
					return { kind: "notice", text: str(item.message) }
				default:
					return { kind: "unknown", raw: parsed }
			}
		}
		default:
			return { kind: "unknown", raw: parsed }
	}
}

export interface CodexRunResult {
	/** Concatenated agent_message text — the subagent's answer. */
	message: string
	threadId: string | null
	usage: CodexUsage | null
	/** Non-fatal notices Codex surfaced (e.g. budget warnings). */
	notices: string[]
}

/**
 * Fold a stream of updates into a final result. Multiple agent messages are
 * joined with blank lines; the last usage/thread wins.
 */
export function reduceCodexUpdates(updates: Iterable<CodexUpdate>): CodexRunResult {
	const messages: string[] = []
	const notices: string[] = []
	let threadId: string | null = null
	let usage: CodexUsage | null = null

	for (const update of updates) {
		switch (update.kind) {
			case "thread":
				threadId = update.threadId || threadId
				break
			case "message":
				if (update.text) messages.push(update.text)
				break
			case "notice":
				if (update.text) notices.push(update.text)
				break
			case "usage":
				usage = update.usage
				break
			default:
				break
		}
	}

	return { message: messages.join("\n\n"), threadId, usage, notices }
}
