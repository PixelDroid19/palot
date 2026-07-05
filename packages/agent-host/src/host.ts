/**
 * AgentHost — the core of the platform. It owns:
 *
 *  - the adapter registry (which runtimes exist)
 *  - run lifecycle (spawn, stream, cancel, timeout)
 *  - per-session serialization (turns on one session never interleave) and a
 *    global concurrency cap (many sessions run in parallel, bounded)
 *  - the event bus every run publishes through
 *  - the shared context store
 *  - delegation: any run can ask another runtime to do work (this is what the
 *    bridge's `palot_delegate` tool calls into)
 *
 * The host knows nothing about Electron, IPC, or UI — embedders subscribe to
 * events and call `run`/`cancel`. That keeps the core portable (desktop app
 * today, a standalone CLI or server tomorrow).
 */
import { whichOnPath } from "@palot/cli-registry"
import { BUILTIN_ADAPTERS } from "./adapters/index"
import { SharedContextStore } from "./context"
import { EventBus } from "./events"
import { AdapterRegistry } from "./registry"
import { type RunHandle, spawnAgentRun } from "./runner"
import type {
	AgentAdapter,
	AgentRunOptions,
	AgentRunResult,
	AgentRuntimeId,
	AgentUpdate,
	BridgeInfo,
} from "./types"

export interface HostEvents extends Record<string, unknown> {
	"run:start": { runId: string; runtimeId: AgentRuntimeId }
	"run:update": { runId: string; runtimeId: AgentRuntimeId; update: AgentUpdate }
	"run:end": { runId: string; runtimeId: AgentRuntimeId; ok: boolean; error?: string }
}

export interface AgentHostOptions {
	/** Max CLI processes running at once across all sessions. Default 8. */
	maxConcurrentRuns?: number
	/** Skip registering the built-in adapters (tests / custom embedders). */
	builtinAdapters?: boolean
	/** Resolve an adapter's binary to an absolute path. Default: PATH lookup. */
	resolveBinary?: (adapter: AgentAdapter) => Promise<string | null>
	/** Provide bridge info to inject into runs (set by the bridge server). */
	bridgeInfo?: () => BridgeInfo | null
}

interface QueueEntry {
	task: () => Promise<void>
}

export class AgentHost {
	readonly adapters = new AdapterRegistry()
	readonly context = new SharedContextStore()
	readonly events = new EventBus<HostEvents>()

	private active = new Map<string, RunHandle>()
	/** Runs accepted but not yet spawned (waiting on session chain / cap). */
	private pending = new Set<string>()
	/** Runs cancelled before they reached the spawn stage (queued/waiting). */
	private cancelledEarly = new Set<string>()
	private sessionChains = new Map<string, Promise<void>>()
	private queue: QueueEntry[] = []
	private running = 0
	private readonly maxConcurrent: number
	private readonly resolveBinary: (adapter: AgentAdapter) => Promise<string | null>
	private bridgeInfo: () => BridgeInfo | null

	constructor(options: AgentHostOptions = {}) {
		this.maxConcurrent = options.maxConcurrentRuns ?? 8
		this.resolveBinary = options.resolveBinary ?? ((adapter) => whichOnPath(adapter.binary))
		this.bridgeInfo = options.bridgeInfo ?? (() => null)
		if (options.builtinAdapters !== false) {
			for (const adapter of BUILTIN_ADAPTERS) this.adapters.register(adapter)
		}
	}

	/** Late-bind the bridge (it needs the host first, then the host needs it). */
	setBridgeInfoProvider(provider: () => BridgeInfo | null): void {
		this.bridgeInfo = provider
	}

	/**
	 * Run one agent turn. `sessionKey` serializes turns: two runs with the same
	 * key never execute concurrently (a chat session is a sessionKey; delegated
	 * one-shot runs pass a unique key). Updates stream via the event bus and the
	 * optional `onUpdate`.
	 */
	async run(
		runId: string,
		runtimeId: AgentRuntimeId,
		opts: AgentRunOptions,
		extra: { sessionKey?: string; onUpdate?: (update: AgentUpdate) => void } = {},
	): Promise<AgentRunResult> {
		if (!opts.prompt.trim()) throw new Error("A task prompt is required")
		const adapter = this.adapters.get(runtimeId)
		if (!adapter) throw new Error(`Unknown agent runtime: ${runtimeId}`)

		this.pending.add(runId)
		const sessionKey = extra.sessionKey ?? runId
		const previous = this.sessionChains.get(sessionKey) ?? Promise.resolve()

		let release: () => void = () => {}
		const chained = new Promise<void>((r) => {
			release = r
		})
		this.sessionChains.set(sessionKey, chained)

		try {
			await previous
			return await this.schedule(() => this.execute(runId, adapter, opts, extra.onUpdate))
		} finally {
			release()
			this.pending.delete(runId)
			this.cancelledEarly.delete(runId)
			if (this.sessionChains.get(sessionKey) === chained) {
				this.sessionChains.delete(sessionKey)
			}
		}
	}

	/**
	 * Delegate a one-shot task to another runtime — the primitive behind
	 * cross-agent capability sharing (Claude asking Codex for an image, Codex
	 * asking Claude to reason). Delegations run read-only-by-default in the
	 * caller's cwd unless the caller widens the sandbox.
	 */
	async delegate(args: {
		runtimeId: AgentRuntimeId
		prompt: string
		cwd: string
		sandbox?: AgentRunOptions["sandbox"]
		model?: string
		timeoutMs?: number
	}): Promise<AgentRunResult> {
		const runId = `delegate-${Math.random().toString(36).slice(2)}`
		return this.run(runId, args.runtimeId, {
			prompt: args.prompt,
			cwd: args.cwd,
			sandbox: args.sandbox ?? "read-only",
			model: args.model,
			timeoutMs: args.timeoutMs,
		})
	}

	/** Cancel a running or still-queued run. Returns true if a run was found. */
	cancel(runId: string): boolean {
		const handle = this.active.get(runId)
		if (handle) {
			handle.cancel()
			return true
		}
		// Not spawned yet (waiting on the session chain or the concurrency cap):
		// mark it so execute() aborts before starting the process.
		if (!this.pending.has(runId)) return false
		this.cancelledEarly.add(runId)
		return true
	}

	listRuntimes(): { id: AgentRuntimeId; displayName: string }[] {
		return this.adapters.list().map((a) => ({ id: a.id, displayName: a.displayName }))
	}

	// --- internals ---

	private schedule<T>(task: () => Promise<T>): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			this.queue.push({
				task: () => task().then(resolve, reject),
			})
			this.pump()
		})
	}

	private pump(): void {
		while (this.running < this.maxConcurrent && this.queue.length > 0) {
			const entry = this.queue.shift()
			if (!entry) break
			this.running++
			entry.task().finally(() => {
				this.running--
				this.pump()
			})
		}
	}

	private async execute(
		runId: string,
		adapter: AgentAdapter,
		opts: AgentRunOptions,
		onUpdate?: (update: AgentUpdate) => void,
	): Promise<AgentRunResult> {
		if (this.cancelledEarly.delete(runId)) {
			throw new Error(`${adapter.displayName} run was cancelled`)
		}
		const binary = await this.resolveBinary(adapter)
		if (!binary) throw new Error(`${adapter.displayName} CLI is not installed`)

		const bridge = opts.bridge ?? this.bridgeInfo() ?? undefined
		const handle = spawnAgentRun(adapter, binary, { ...opts, bridge }, (update) => {
			this.events.emit("run:update", { runId, runtimeId: adapter.id, update })
			onUpdate?.(update)
		})
		this.active.set(runId, handle)
		this.events.emit("run:start", { runId, runtimeId: adapter.id })
		try {
			const result = await handle.result
			this.events.emit("run:end", { runId, runtimeId: adapter.id, ok: true })
			return result
		} catch (err) {
			this.events.emit("run:end", {
				runId,
				runtimeId: adapter.id,
				ok: false,
				error: err instanceof Error ? err.message : String(err),
			})
			throw err
		} finally {
			this.active.delete(runId)
		}
	}
}
