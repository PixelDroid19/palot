/**
 * Core contracts for the Palot agent platform.
 *
 * The core is deliberately tiny: it only knows about agents (adapters),
 * sessions, runs, events, and shared context. Everything provider-specific
 * lives in an {@link AgentSessionProvider}; everything app-specific (IPC, UI, storage)
 * lives outside this package. New CLIs — including third-party ones — are
 * added by registering a provider, never by modifying the core.
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

/** How a permission request may be answered. */
export type AgentPermissionDecision = "accept" | "acceptForSession" | "decline"

/**
 * A tool/command approval the agent is waiting on. The run blocks until the
 * embedder answers via `AgentSession.respondPermission(requestId, decision)`.
 */
export interface AgentPermissionRequest {
	requestId: string
	/** What kind of action needs approval (e.g. "command", "file-change", "tool"). */
	action: string
	/** Tool/command being requested, for display. */
	name: string
	detail?: string
	/** Optional explanatory reason from the CLI (e.g. needs network access). */
	reason?: string
	/** Decisions the CLI supports for this request. */
	decisions: AgentPermissionDecision[]
}

/** A normalized, UI-friendly update derived from a CLI's raw output. */
export type AgentUpdate =
	| { kind: "thread"; threadId: string }
	/** A complete message block (final answer text). */
	| { kind: "message"; text: string }
	/** An incremental chunk of the in-progress answer (streaming). */
	| { kind: "message-delta"; text: string }
	/** A complete reasoning block (e.g. one Codex reasoning summary). */
	| { kind: "reasoning"; text: string }
	/** An incremental chunk of in-progress reasoning (streaming thinking). */
	| { kind: "reasoning-delta"; text: string }
	/**
	 * A tool/command the agent invoked. `id` correlates a start with its
	 * completion; `status` defaults to a one-shot "completed" notification.
	 */
	| {
			kind: "tool"
			name: string
			detail?: string
			id?: string
			status?: "running" | "completed" | "error"
			output?: string
	  }
	| { kind: "notice"; text: string }
	| { kind: "usage"; usage: AgentUsage }
	/** The agent requests approval; answer via `respondPermission`. */
	| { kind: "permission"; request: AgentPermissionRequest }
	/** A pending permission request was answered or cancelled. */
	| { kind: "permission-resolved"; requestId: string; decision: AgentPermissionDecision | null }
	/** The agent asks the user a structured question; answer via `answerQuestion`. */
	| { kind: "question"; request: AgentQuestionRequest }
	/** A pending question was answered or cancelled. */
	| { kind: "question-resolved"; requestId: string }
	| { kind: "unknown"; raw: unknown }

/** One choice in a question the agent asks the user. */
export interface AgentQuestionOption {
	label: string
	description?: string
}

/** A single question within an {@link AgentQuestionRequest}. */
export interface AgentQuestion {
	/** The full question text (also the key answers are returned under). */
	question: string
	/** Short chip label for the question (≤12 chars). */
	header?: string
	/** Whether more than one option may be selected. */
	multiSelect: boolean
	options: AgentQuestionOption[]
}

/**
 * A structured multiple-choice question the agent poses (Claude's
 * AskUserQuestion tool). The run blocks until answered via
 * `AgentSession.answerQuestion(requestId, answers)`, where `answers` maps each
 * question's text to the chosen option label(s).
 */
export interface AgentQuestionRequest {
	requestId: string
	questions: AgentQuestion[]
}

/**
 * Permission posture for a session. `plan` is a read-only planning mode: the
 * agent may explore and propose a plan but must not write or run
 * side-effecting actions until the user approves it (Claude's native plan
 * mode). It always wins over a more permissive level, so a plan turn can never
 * leak writes.
 */
export type AgentSandbox = "plan" | "read-only" | "workspace-write" | "danger-full-access"

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
	/** Surfaces tool-approval requests that the user answers interactively. */
	permissions: boolean
	/** Can interrupt an in-flight turn without losing the session. */
	interrupt: boolean
	/** Accepts steering input while a turn is running. */
	steering: boolean
}

/** Session-level UX affordances a runtime can back in Palot. */
export interface AgentSessionCapabilities {
	supportsSessionRevert: boolean
	supportsSessionSummarize: boolean
	supportsServerSlashCommands: boolean
	supportsFork: boolean
	supportsProjectRuntimeConfig: boolean
	supportsWorktreeLaunch: boolean
	supportsServerHistory: boolean
}

/** Full description of a runtime for pickers and settings UIs. */
export interface AgentRuntimeDescriptor {
	id: AgentRuntimeId
	displayName: string
	installed: boolean
	capabilities: AgentRuntimeCapabilities
	sessionCapabilities: AgentSessionCapabilities
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

export interface AgentRunResult {
	/** The agent's answer (joined message text). */
	message: string
	threadId: string | null
	usage: AgentUsage | null
	/** Non-fatal notices the agent surfaced. */
	notices: string[]
}

/** Options for opening a persistent agent session. */
export interface AgentSessionOptions {
	/** Working root the agent operates in. */
	cwd: string
	/** Sandbox / permission posture. Providers map this to their native policy. */
	sandbox?: AgentSandbox
	/** Initial model (per-turn overrides win). */
	model?: string
	/** Initial reasoning effort (per-turn overrides win). */
	reasoningEffort?: string
	/** Resume the CLI's own thread/session by id. */
	resumeId?: string
	/** Inter-agent bridge to expose to the CLI (providers may ignore it). */
	bridge?: BridgeInfo
	/** Extra environment variables for the CLI process. */
	env?: Record<string, string>
}

/** One user turn sent into a session. */
export interface AgentTurnInput {
	text: string
	/** Absolute paths of image files to attach. */
	images?: string[]
	/** Model override for this turn and subsequent turns. */
	model?: string
	/** Reasoning-effort override for this turn and subsequent turns. */
	reasoningEffort?: string
	/** Sandbox override for this turn and subsequent turns. */
	sandbox?: AgentSandbox
}

/**
 * A live conversation with one CLI agent. The underlying process/thread stays
 * alive across turns, so context, caches and tool state persist. All updates
 * stream through the `onUpdate` callback supplied at open time.
 */
export interface AgentSession {
	/** The CLI's own thread/session id once known (usable as `resumeId`). */
	readonly threadId: string | null
	/** True while a turn is executing. */
	readonly busy: boolean
	/**
	 * Run one turn. Resolves when the turn completes (or is interrupted) with
	 * the reduced result. Rejects on transport/session failure.
	 */
	send(input: AgentTurnInput): Promise<AgentRunResult>
	/** Inject steering input into the running turn (capability `steering`). */
	steer(text: string): Promise<void>
	/** Stop the in-flight turn; the session remains usable. */
	interrupt(): Promise<void>
	/** Answer a pending permission request. */
	respondPermission(requestId: string, decision: AgentPermissionDecision): void
	/**
	 * Answer a pending structured question. `answers` maps each question's text
	 * to the chosen option label(s) (comma-joined for multi-select). Providers
	 * that don't surface questions may leave this a no-op.
	 */
	answerQuestion(requestId: string, answers: Record<string, string>): void
	/** Tear down the session and its process resources. */
	close(): Promise<void>
}

/**
 * How one coding-agent CLI is driven. Providers own real process state (a
 * shared app-server, per-session SDK queries, …) — nothing is spawned per
 * turn; that is what makes streaming, permissions and interrupts work the way
 * the CLI's own UI does.
 */
export interface AgentSessionProvider {
	id: AgentRuntimeId
	displayName: string
	/** Executable name to resolve on PATH (install detection). */
	binary: string
	capabilities: AgentRuntimeCapabilities
	sessionCapabilities: AgentSessionCapabilities
	/**
	 * Discover the models this CLI can run from the CLI's own source of truth.
	 * Never throws; returns a fallback on any error. First entry = default.
	 */
	listModels(): Promise<AgentModelInfo[]>
	/** Open a persistent session. */
	openSession(
		opts: AgentSessionOptions,
		onUpdate: (update: AgentUpdate) => void,
	): Promise<AgentSession>
	/** Release provider-wide resources (shared processes). */
	dispose(): Promise<void>
}

// Shared parsing helpers for providers.

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
