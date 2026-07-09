/**
 * AgentHost — the core of the platform. It owns:
 *
 *  - the provider registry (which runtimes exist and how they're driven)
 *  - persistent sessions (open, prompt, steer, interrupt, permissions, close)
 *  - the event bus every session publishes through
 *  - the shared context store
 *  - delegation: any run can ask another runtime to do work through an
 *    ephemeral session (this is what the bridge's `palot_delegate` calls)
 *
 * The host knows nothing about Electron, IPC, or UI — embedders subscribe to
 * events and drive sessions. That keeps the core portable (desktop app today,
 * a standalone CLI or server tomorrow).
 */
import { whichOnPath } from "@palot/cli-registry"
import { SharedContextStore } from "./context"
import { EventBus } from "./events"
import { ClaudeProvider } from "./providers/claude"
import { CodexProvider } from "./providers/codex"
import type {
	AgentPermissionDecision,
	AgentRunResult,
	AgentRuntimeDescriptor,
	AgentRuntimeId,
	AgentSession,
	AgentSessionOptions,
	AgentSessionProvider,
	AgentTurnInput,
	AgentUpdate,
	BridgeInfo,
} from "./types"
import { resolveRuntimeTransport } from "./types"

const RUNTIME_CACHE_TTL_MS = 60_000
const DELEGATE_TIMEOUT_MS = 5 * 60 * 1000

export interface HostEvents extends Record<string, unknown> {
	"session:update": { sessionId: string; runtimeId: AgentRuntimeId; update: AgentUpdate }
	"turn:start": { sessionId: string; runtimeId: AgentRuntimeId }
	"turn:end": { sessionId: string; runtimeId: AgentRuntimeId; ok: boolean; error?: string }
}

export interface AgentHostOptions {
	/** Skip registering the built-in providers (tests / custom embedders). */
	builtinProviders?: boolean
	/** Resolve a provider's binary to an absolute path. Default: PATH lookup. */
	resolveBinary?: (binary: string) => Promise<string | null>
	/** Provide bridge info to inject into sessions (set by the bridge server). */
	bridgeInfo?: () => BridgeInfo | null
}

interface SessionEntry {
	session: AgentSession
	runtimeId: AgentRuntimeId
}

export class AgentHost {
	readonly context = new SharedContextStore()
	readonly events = new EventBus<HostEvents>()

	private providers = new Map<AgentRuntimeId, AgentSessionProvider>()
	private sessions = new Map<string, SessionEntry>()
	private runtimeCache: { at: number; value: AgentRuntimeDescriptor[] } | null = null
	private readonly resolveBinary: (binary: string) => Promise<string | null>
	private bridgeInfo: () => BridgeInfo | null

	constructor(options: AgentHostOptions = {}) {
		this.resolveBinary = options.resolveBinary ?? ((binary) => whichOnPath(binary))
		this.bridgeInfo = options.bridgeInfo ?? (() => null)
		if (options.builtinProviders !== false) {
			this.registerProvider(new CodexProvider(() => this.resolveBinary("codex")))
			this.registerProvider(new ClaudeProvider(() => this.resolveBinary("claude")))
		}
	}

	registerProvider(provider: AgentSessionProvider): void {
		this.providers.set(provider.id, provider)
		this.runtimeCache = null
	}

	/** Late-bind the bridge (it needs the host first, then the host needs it). */
	setBridgeInfoProvider(provider: () => BridgeInfo | null): void {
		this.bridgeInfo = provider
	}

	listRuntimes(): { id: AgentRuntimeId; displayName: string }[] {
		return [...this.providers.values()].map((p) => ({ id: p.id, displayName: p.displayName }))
	}

	/**
	 * Full runtime descriptors (install state, capabilities, model catalog) for
	 * pickers. Model catalogs come from each CLI's own source of truth. Cached
	 * briefly — a fresh install should show up without a restart.
	 */
	async describeRuntimes(): Promise<AgentRuntimeDescriptor[]> {
		const now = Date.now()
		if (this.runtimeCache && now - this.runtimeCache.at < RUNTIME_CACHE_TTL_MS) {
			return this.runtimeCache.value
		}
		const descriptors = await Promise.all(
			[...this.providers.values()].map(async (provider): Promise<AgentRuntimeDescriptor> => {
				const [binary, models] = await Promise.all([
					this.resolveBinary(provider.binary).catch(() => null),
					provider.listModels().catch(() => []),
				])
				return {
					id: provider.id,
					displayName: provider.displayName,
					installed: !!binary,
					capabilities: provider.capabilities,
					sessionCapabilities: provider.sessionCapabilities,
					transport: resolveRuntimeTransport({
						capabilities: provider.capabilities,
						sessionCapabilities: provider.sessionCapabilities,
					}),
					models,
				}
			}),
		)
		this.runtimeCache = { at: now, value: descriptors }
		return descriptors
	}

	/** Open (or return) the persistent session behind `sessionId`. */
	async openSession(
		sessionId: string,
		runtimeId: AgentRuntimeId,
		opts: Omit<AgentSessionOptions, "bridge">,
	): Promise<AgentSession> {
		const existing = this.sessions.get(sessionId)
		if (existing) {
			if (existing.runtimeId !== runtimeId) {
				throw new Error(
					`Session ${sessionId} already exists for runtime ${existing.runtimeId}, not ${runtimeId}`,
				)
			}
			return existing.session
		}
		const provider = this.providers.get(runtimeId)
		if (!provider) throw new Error(`Unknown agent runtime: ${runtimeId}`)
		const session = await provider.openSession(
			{ ...opts, bridge: this.bridgeInfo() ?? undefined },
			(update) => this.events.emit("session:update", { sessionId, runtimeId, update }),
		)
		this.sessions.set(sessionId, { session, runtimeId })
		return session
	}

	getSession(sessionId: string): AgentSession | null {
		return this.sessions.get(sessionId)?.session ?? null
	}

	/** Run one turn on an open session, emitting turn lifecycle events. */
	async prompt(sessionId: string, input: AgentTurnInput): Promise<AgentRunResult> {
		const entry = this.sessions.get(sessionId)
		if (!entry) throw new Error(`No open session: ${sessionId}`)
		if (!input.text.trim()) throw new Error("A task prompt is required")
		this.events.emit("turn:start", { sessionId, runtimeId: entry.runtimeId })
		try {
			const result = await entry.session.send(input)
			this.events.emit("turn:end", { sessionId, runtimeId: entry.runtimeId, ok: true })
			return result
		} catch (err) {
			this.events.emit("turn:end", {
				sessionId,
				runtimeId: entry.runtimeId,
				ok: false,
				error: err instanceof Error ? err.message : String(err),
			})
			throw err
		}
	}

	async steer(sessionId: string, text: string): Promise<void> {
		const entry = this.sessions.get(sessionId)
		if (!entry) throw new Error(`No open session: ${sessionId}`)
		await entry.session.steer(text)
	}

	async interrupt(sessionId: string): Promise<boolean> {
		const entry = this.sessions.get(sessionId)
		if (!entry) return false
		await entry.session.interrupt()
		return true
	}

	respondPermission(
		sessionId: string,
		requestId: string,
		decision: AgentPermissionDecision,
	): boolean {
		const entry = this.sessions.get(sessionId)
		if (!entry) return false
		entry.session.respondPermission(requestId, decision)
		return true
	}

	answerQuestion(sessionId: string, requestId: string, answers: Record<string, string>): boolean {
		const entry = this.sessions.get(sessionId)
		if (!entry) return false
		entry.session.answerQuestion(requestId, answers)
		return true
	}

	async closeSession(sessionId: string): Promise<void> {
		const entry = this.sessions.get(sessionId)
		if (!entry) return
		this.sessions.delete(sessionId)
		await entry.session.close().catch(() => {})
	}

	/**
	 * Delegate a one-shot task to another runtime — the primitive behind
	 * cross-agent capability sharing. Runs in an ephemeral session that is
	 * closed when the turn finishes.
	 */
	async delegate(args: {
		runtimeId: AgentRuntimeId
		prompt: string
		cwd: string
		sandbox?: AgentSessionOptions["sandbox"]
		model?: string
		timeoutMs?: number
	}): Promise<AgentRunResult> {
		const provider = this.providers.get(args.runtimeId)
		if (!provider) throw new Error(`Unknown agent runtime: ${args.runtimeId}`)
		let sessionRef: AgentSession | null = null
		let timeoutHandle: ReturnType<typeof setTimeout> | null = null
		const session = await provider.openSession(
			{ cwd: args.cwd, sandbox: args.sandbox ?? "read-only", model: args.model },
			(update) => {
				// Delegated one-shot runs auto-decline approvals: there is no user
				// attached, and read-only work shouldn't need escalation.
				if (update.kind === "permission") {
					sessionRef?.respondPermission(update.request.requestId, "decline")
				}
			},
		)
		sessionRef = session
		const timeoutMs = args.timeoutMs ?? DELEGATE_TIMEOUT_MS
		try {
			const sendResult = await Promise.race([
				session.send({ text: args.prompt }),
				new Promise<never>((_, reject) => {
					timeoutHandle = setTimeout(() => {
						session.interrupt().catch(() => {})
						reject(
							new Error(
								`${provider.displayName} delegate timed out after ${Math.round(timeoutMs / 1000)}s`,
							),
						)
					}, timeoutMs)
					timeoutHandle?.unref?.()
				}),
			])
			return sendResult
		} finally {
			if (timeoutHandle) clearTimeout(timeoutHandle)
			await session.close().catch(() => {})
		}
	}

	/** Tear down all sessions and provider processes. */
	async dispose(): Promise<void> {
		await Promise.all([...this.sessions.keys()].map((id) => this.closeSession(id)))
		await Promise.all([...this.providers.values()].map((p) => p.dispose().catch(() => {})))
	}
}
