/**
 * Runtime abstraction for driving coding-agent CLIs as delegated subagents.
 *
 * Palot is not tied to a single agent runtime. Each supported CLI (OpenCode,
 * Codex, Claude Code, …) is described by an {@link AgentAdapter}: how to build
 * its non-interactive command and how to parse its output into a common,
 * normalized {@link AgentUpdate} stream. A generic runner spawns the process,
 * so adding a CLI never touches the runner or the UI.
 */

/** Runtimes that can be driven headlessly. Mirrors CLI ids from cli-registry. */
export type AgentRuntimeId = "codex" | "claude"

export interface AgentUsage {
	inputTokens: number
	cachedInputTokens: number
	outputTokens: number
	reasoningOutputTokens: number
}

/** A normalized, UI-friendly update derived from a CLI's raw output. */
export type AgentUpdate =
	| { kind: "thread"; threadId: string }
	| { kind: "message"; text: string }
	| { kind: "reasoning"; text: string }
	| { kind: "notice"; text: string }
	| { kind: "usage"; usage: AgentUsage }
	| { kind: "unknown"; raw: unknown }

export type AgentSandbox = "read-only" | "workspace-write" | "danger-full-access"

export interface AgentRunOptions {
	/** The task/instructions for the agent. */
	prompt: string
	/** Working root the agent operates in. */
	cwd: string
	/** Sandbox / permission posture. Adapters map this to their own flags. */
	sandbox?: AgentSandbox
	/** Optional model override. */
	model?: string
}

export interface AgentRunResult {
	/** The agent's answer (joined message text). */
	message: string
	threadId: string | null
	usage: AgentUsage | null
	/** Non-fatal notices the agent surfaced. */
	notices: string[]
}

/**
 * Declarative description of how to drive one coding-agent CLI. Adapters hold
 * no process state: `buildArgs` and `parseLine` are pure, which keeps them
 * unit-testable against each CLI's real output.
 */
export interface AgentAdapter {
	id: AgentRuntimeId
	displayName: string
	/** Executable name to resolve on PATH. */
	binary: string
	/** Build the non-interactive argument vector for a run. */
	buildArgs: (opts: AgentRunOptions) => string[]
	/**
	 * Parse one line of stdout into zero or more normalized updates (a single
	 * line may carry both a message and usage). Returns `[]` for blank or
	 * unmeaningful lines. Must never throw.
	 */
	parseLine: (line: string) => AgentUpdate[]
}

/**
 * Fold a stream of updates into a final result. Multiple messages are joined
 * with blank lines; the last usage/thread wins.
 */
export function reduceAgentUpdates(updates: Iterable<AgentUpdate>): AgentRunResult {
	const messages: string[] = []
	const notices: string[] = []
	let threadId: string | null = null
	let usage: AgentUsage | null = null

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

// Shared parsing helpers for adapters.

export function asRecord(value: unknown): Record<string, unknown> | null {
	return value != null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null
}

export function readString(value: unknown): string {
	return typeof value === "string" ? value : ""
}

export function readNumber(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0
}
