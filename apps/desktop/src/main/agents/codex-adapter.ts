import {
	type AgentAdapter,
	type AgentUpdate,
	asRecord,
	readNumber,
	readString,
} from "./types"

/**
 * Codex (`codex exec --json`) adapter. Emits a JSONL event stream:
 *   thread.started · turn.started · item.completed{agent_message|reasoning|error}
 *   · turn.completed{usage}
 * Unknown event/item types are surfaced generically so a version bump can't
 * silently break the runner.
 */

function parseUsage(raw: Record<string, unknown>) {
	return {
		inputTokens: readNumber(raw.input_tokens),
		cachedInputTokens: readNumber(raw.cached_input_tokens),
		outputTokens: readNumber(raw.output_tokens),
		reasoningOutputTokens: readNumber(raw.reasoning_output_tokens),
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
		case "turn.completed": {
			const usage = asRecord(event.usage)
			return usage
				? [{ kind: "usage", usage: parseUsage(usage) }]
				: [{ kind: "unknown", raw: parsed }]
		}
		case "item.completed": {
			const item = asRecord(event.item)
			if (!item) return [{ kind: "unknown", raw: parsed }]
			switch (item.type) {
				case "agent_message":
					return [{ kind: "message", text: readString(item.text) }]
				case "reasoning":
					return [{ kind: "reasoning", text: readString(item.text) }]
				case "error":
					return [{ kind: "notice", text: readString(item.message) }]
				default:
					return [{ kind: "unknown", raw: parsed }]
			}
		}
		default:
			return [{ kind: "unknown", raw: parsed }]
	}
}

export const codexAdapter: AgentAdapter = {
	id: "codex",
	displayName: "Codex",
	binary: "codex",
	buildArgs: (opts) => {
		const args = [
			"exec",
			"--json",
			"--skip-git-repo-check",
			"-s",
			opts.sandbox ?? "read-only",
			"-C",
			opts.cwd,
		]
		if (opts.model) args.push("-m", opts.model)
		args.push(opts.prompt)
		return args
	},
	parseLine: parseCodexLine,
}
