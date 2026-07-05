/**
 * Core contracts for the Palot agent platform.
 *
 * The core is deliberately tiny: it only knows about agents (adapters),
 * sessions, runs, events, and shared context. Everything provider-specific
 * lives in an {@link AgentAdapter}; everything app-specific (IPC, UI, storage)
 * lives outside this package. New CLIs — including third-party ones — are
 * added by registering an adapter, never by modifying the core.
 */

/**
 * Open identifier for an agent runtime. Built-in adapters use "codex" and
 * "claude"; plugins may register any other id.
 */
export type AgentRuntimeId = string

export interface AgentUsage {
	inputTokens: number
	cachedInputTokens: number
	outputTokens: number
	reasoningOutputTokens: number
}

/** A normalized, UI-friendly update derived from a CLI's raw output. */
export type AgentUpdate =
	| { kind: "thread"; threadId: string }
	/** A complete message block (final answer text). */
	| { kind: "message"; text: string }
	/** An incremental chunk of the in-progress answer (streaming). */
	| { kind: "message-delta"; text: string }
	| { kind: "reasoning"; text: string }
	/** A tool/command the agent invoked, for progress display. */
	| { kind: "tool"; name: string; detail?: string }
	| { kind: "notice"; text: string }
	| { kind: "usage"; usage: AgentUsage }
	| { kind: "unknown"; raw: unknown }

export type AgentSandbox = "read-only" | "workspace-write" | "danger-full-access"

/** A model a runtime can run, discovered from the CLI's own catalog. */
export interface AgentModelInfo {
	/** Value passed to the CLI's model flag; "" = the CLI's configured default. */
	slug: string
	label: string
	/** Reasoning-effort levels this model supports (empty = not tunable). */
	efforts: string[]
	defaultEffort?: string
}

/** What a runtime can do — drives which UI affordances are shown. */
export interface AgentRuntimeCapabilities {
	/** Accepts image attachments on a prompt. */
	imageInput: boolean
	/** Supports a reasoning-effort flag. */
	reasoningEffort: boolean
	/** Can resume its own sessions for multi-turn context. */
	resume: boolean
}

/** Full description of a runtime for pickers and settings UIs. */
export interface AgentRuntimeDescriptor {
	id: AgentRuntimeId
	displayName: string
	installed: boolean
	capabilities: AgentRuntimeCapabilities
	models: AgentModelInfo[]
}

/**
 * Capabilities the host offers to a run (inter-agent bridge). When present,
 * adapters that support MCP inject the Palot bridge so the CLI can delegate
 * to other agents and read/write shared context.
 */
export interface BridgeInfo {
	/** Loopback URL of the bridge HTTP server. */
	url: string
	/** Bearer token authorizing this run. */
	token: string
	/** Absolute path to the stdio MCP proxy script (plain Node.js, no deps). */
	proxyScriptPath: string
	/** Node-compatible executable used to launch the proxy. */
	nodeBinary: string
	/**
	 * Extra env for the proxy process (e.g. ELECTRON_RUN_AS_NODE=1 when the
	 * embedder points nodeBinary at an Electron binary).
	 */
	proxyEnv?: Record<string, string>
}

export interface AgentRunOptions {
	/** The task/instructions for the agent. */
	prompt: string
	/** Working root the agent operates in. */
	cwd: string
	/** Sandbox / permission posture. Adapters map this to their own flags. */
	sandbox?: AgentSandbox
	/** Optional model override. */
	model?: string
	/** Optional reasoning-effort override (adapter maps it to its own flag). */
	reasoningEffort?: string
	/**
	 * Resume an existing conversation by its thread/session id (from a prior
	 * run's result) to keep multi-turn context. Omit to start a fresh session.
	 */
	resumeId?: string
	/** Absolute paths of image files to attach to the prompt. */
	images?: string[]
	/** Inter-agent bridge to expose to the CLI (adapters may ignore it). */
	bridge?: BridgeInfo
	/** Hard wall-clock limit for the run. Default: 10 minutes. */
	timeoutMs?: number
	/** Extra environment variables for the spawned process. */
	env?: Record<string, string>
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
 * no process state: `buildCommand` and `parseLine` are pure, which keeps them
 * unit-testable against each CLI's real output.
 */
export interface AgentAdapter {
	id: AgentRuntimeId
	displayName: string
	/** Executable name to resolve on PATH. */
	binary: string
	capabilities: AgentRuntimeCapabilities
	/**
	 * Discover the models this CLI can run — from the CLI's own catalog when it
	 * publishes one (e.g. Codex's models cache), otherwise a maintained static
	 * list. Never throws; returns the fallback on any error. The first entry
	 * should be the "default" choice.
	 */
	listModels: () => Promise<AgentModelInfo[]>
	/**
	 * Build the non-interactive invocation for a run. When `stdin` is returned,
	 * the runner writes it to the process and closes the pipe — preferred for
	 * prompts, since argv has platform length limits and quoting hazards.
	 */
	buildCommand: (opts: AgentRunOptions) => { args: string[]; stdin?: string }
	/**
	 * Parse one line of stdout into zero or more normalized updates (a single
	 * line may carry both a message and usage). Returns `[]` for blank or
	 * unmeaningful lines. Must never throw.
	 */
	parseLine: (line: string) => AgentUpdate[]
}

/**
 * Fold a stream of updates into a final result. Multiple messages are joined
 * with blank lines; deltas only count when no complete message arrived; the
 * last usage/thread wins.
 */
export function reduceAgentUpdates(updates: Iterable<AgentUpdate>): AgentRunResult {
	const messages: string[] = []
	const notices: string[] = []
	let deltas = ""
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
			case "message-delta":
				deltas += update.text
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

	return { message: messages.length ? messages.join("\n\n") : deltas, threadId, usage, notices }
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
