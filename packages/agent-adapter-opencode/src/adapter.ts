/**
 * OpenCode provider adapter implementation.
 *
 * Implements AgentProviderAdapter fully using ONLY @opencode-ai/sdk/v2/client .
 * Connection uses client.global.event() for /global/event (all projects).
 * Commands: dispatch maps to SDK (promptAsync *always* receives resolved model).
 * Events: internal SSE loop mapped via mapOpenCodeEventToPalot -> yielded.
 *
 * Pure where possible: fetch can be injected by host for proxy needs.
 * No SDK types escape the adapter boundary.
 *
 * Full JSDoc per requirements.
 */

import type { OpencodeClient } from "@opencode-ai/sdk/v2/client"

import type {
	AgentProviderAdapter,
	GetSessionInput,
	ListSessionsInput,
	PalotCommand,
	PalotEvent,
	ProviderConnection,
	ProviderConnectionInput,
	SessionInfo,
	WorkspaceInfo,
} from "@palot/core"
import { createOpenCodeClient } from "./client"
import {
	mapOpenCodeEventToPalot,
	mapOpenCodeSession,
	mapPalotResponseToReply,
} from "./event-mapper"

/**
 * OpenCode-specific adapter.
 * Class name per task spec: OpenCodeAgentAdapter .
 */
export class OpenCodeAgentAdapter implements AgentProviderAdapter {
	readonly id = "opencode"
	readonly label = "OpenCode"

	private client: OpencodeClient | null = null
	private connection: ProviderConnection | null = null
	private abortController: AbortController | null = null
	private eventQueue: PalotEvent[] = []
	private queueWaiters: Array<(ev: PalotEvent | null) => void> = []
	private streamRunning = false

	/**
	 * Connect to an OpenCode server.
	 * Creates SDK client (respecting injected fetch if provided for Electron IPC proxy).
	 * Starts background consumption of client.global.event() .
	 * Immediately yields a provider.connected via the events() iterable.
	 */
	async connect(input: ProviderConnectionInput): Promise<ProviderConnection> {
		if (this.client) {
			await this.disconnect()
		}

		this.abortController = new AbortController()
		const signal = this.abortController.signal

		// host may extend input at runtime with fetch (for proxy); extract via unknown (no any)
		const ext = input as unknown as { fetch?: import("./client").FetchFn }
		this.client = createOpenCodeClient({
			url: input.url,
			directory: input.directory,
			authHeader: input.authHeader ?? null,
			fetch: ext.fetch,
		})

		const connectedAt = Date.now()
		this.connection = {
			providerId: this.id,
			connectedAt,
			url: input.url,
		}

		// Seed the connected event for consumers of events()
		this.enqueueEvent({
			type: "provider.connected",
			providerId: this.id,
			at: connectedAt,
		})

		// Start the global event stream (non-blocking) unless host requested dispatch-only
		// (streamEvents:false) to avoid duplicate SSE during migration dual-write.
		// See ProviderConnectionInput.streamEvents and connection-manager compat layer.
		const shouldStream = input.streamEvents ?? true
		if (shouldStream) {
			this.startGlobalEventStream(signal)
		}

		return this.connection
	}

	/**
	 * Stop the stream, abort controller, clear client.
	 * Enqueues provider.disconnected .
	 */
	async disconnect(): Promise<void> {
		const reason = "disconnect requested"
		if (this.abortController && !this.abortController.signal.aborted) {
			this.abortController.abort()
		}
		this.streamRunning = false
		this.client = null
		this.abortController = null

		this.enqueueEvent({
			type: "provider.disconnected",
			providerId: this.id,
			at: Date.now(),
			reason,
		})

		// wake waiters
		this.flushWaiters()
	}

	/** List workspaces = projects from OpenCode. */
	async listWorkspaces(): Promise<WorkspaceInfo[]> {
		if (!this.client) return []
		try {
			const res = await this.client.project.list()
			// biome-ignore lint/suspicious/noExplicitAny: SDK response data shape is loose / versioned
			const projects = (res.data as any[]) ?? []
			// biome-ignore lint/suspicious/noExplicitAny: p is project from SDK list
			return projects.map((p: any) => ({
				id: p.id,
				name: p.name || p.worktree?.split("/").pop() || p.id,
				directory: p.worktree || "",
			}))
		} catch {
			return []
		}
	}

	/** List sessions for (optional) workspace. */
	async listSessions(input: ListSessionsInput): Promise<SessionInfo[]> {
		if (!this.client) return []
		try {
			// biome-ignore lint/suspicious/noExplicitAny: params passed to SDK, shape matches at runtime
			const params: any = {
				limit: input.limit,
				roots: input.roots,
				search: input.search,
			}
			// directory scoping if workspace given (adapter consumer maps id->dir if needed)
			const res = await this.client.session.list(params)
			// biome-ignore lint/suspicious/noExplicitAny: SDK response data shape is loose / versioned
			const sessions = (res.data as any[]) ?? []
			// biome-ignore lint/suspicious/noExplicitAny: s is session from SDK list
			return sessions.map((s: any) => mapOpenCodeSession(s, input.workspaceId))
		} catch {
			return []
		}
	}

	/** Get one session. */
	async getSession(input: GetSessionInput): Promise<SessionInfo | null> {
		if (!this.client) return null
		try {
			const res = await this.client.session.get({ sessionID: input.sessionId })
			// biome-ignore lint/suspicious/noExplicitAny: SDK response data shape is loose / versioned
			const s = res.data as any
			return s ? mapOpenCodeSession(s, input.workspaceId) : null
		} catch {
			return null
		}
	}

	/**
	 * Dispatch PalotCommand to OpenCode SDK calls.
	 * Critical: for session.prompt, ALWAYS pass a model (never rely on server default).
	 * Uses promptAsync as per spec.
	 */
	async dispatch(command: PalotCommand): Promise<void> {
		if (!this.client) {
			throw new Error("OpenCodeAgentAdapter not connected")
		}

		switch (command.type) {
			case "session.create": {
				await this.client.session.create({
					title: command.title,
					// permission etc if present on command
				})
				// session.created will arrive via SSE; nothing to return
				return
			}

			case "session.prompt": {
				// REQUIRE resolved model - per all docs, AGENTS.md, and critical footgun.
				// No silent fallback: caller (host/adapter user) must supply from view model or settings.
				if (!command.model || !command.model.providerID || !command.model.modelID) {
					throw new Error(
						"OpenCodeAgentAdapter: session.prompt requires resolved model {providerID, modelID}",
					)
				}
				const model = command.model
				// Map PromptPart[] -> SDK parts (text primary for now)
				const parts = command.parts.map((p) => {
					if (p.type === "text") return { type: "text" as const, text: p.content ?? "" }
					if (p.type === "file" || p.type === "image") {
						return { type: "file" as const, mime: p.mediaType ?? "text/plain", url: p.path ?? "" }
					}
					return { type: "text" as const, text: p.content ?? "" }
				})

				await this.client.session.promptAsync({
					sessionID: command.sessionId,
					parts,
					model: { providerID: model.providerID, modelID: model.modelID },
					agent: command.agent,
					variant: command.variant,
				})
				return
			}

			case "session.abort": {
				await this.client.session.abort({ sessionID: command.sessionId })
				return
			}

			case "session.delete": {
				await this.client.session.delete({ sessionID: command.sessionId })
				return
			}

			case "session.rename": {
				await this.client.session.update({ sessionID: command.sessionId, title: command.title })
				return
			}

			case "permission.respond": {
				const reply = mapPalotResponseToReply(command.response)
				await this.client.permission.reply({
					requestID: command.requestId,
					reply,
				})
				return
			}

			case "question.reply": {
				// Map our answers to SDK shape (array of string arrays)
				const answers = command.answers.map((a) =>
					a.text ? [a.text] : a.optionId ? [a.optionId] : [],
				)
				await this.client.question.reply({
					requestID: command.requestId,
					answers,
				})
				return
			}

			case "question.reject": {
				await this.client.question.reject({ requestID: command.requestId })
				return
			}

			case "automation.run-now":
			case "automation.cancel-run":
			case "settings.set":
			case "provider.select":
			case "workspace.refresh": {
				// Not directly mapped for OpenCode today; no-op or future
				return
			}

			default: {
				// biome-ignore lint/suspicious/noExplicitAny: exhaustive default for unknown command
				throw new Error(`OpenCodeAgentAdapter: unhandled command type ${(command as any).type}`)
			}
		}
	}

	/**
	 * Returns async iterator over PalotEvents produced by this adapter.
	 * Consumes the internal queue populated by the global SSE mapper.
	 * Respects signal for abort.
	 */
	async *events(signal: AbortSignal): AsyncIterable<PalotEvent> {
		while (!signal.aborted) {
			const ev = await this.dequeueEvent(signal)
			if (ev === null) break // aborted
			yield ev
		}
	}

	// ============================================================
	// Internal helpers
	// ============================================================

	private enqueueEvent(ev: PalotEvent): void {
		this.eventQueue.push(ev)
		this.flushWaiters()
	}

	private flushWaiters(): void {
		while (this.queueWaiters.length > 0 && this.eventQueue.length > 0) {
			const waiter = this.queueWaiters.shift()!
			const ev = this.eventQueue.shift()!
			waiter(ev)
		}
	}

	private async dequeueEvent(signal: AbortSignal): Promise<PalotEvent | null> {
		if (this.eventQueue.length > 0) {
			return this.eventQueue.shift()!
		}
		if (signal.aborted) return null

		return new Promise<PalotEvent | null>((resolve) => {
			const waiter = (ev: PalotEvent | null) => {
				if (signal.aborted) {
					resolve(null)
					return
				}
				resolve(ev)
			}
			this.queueWaiters.push(waiter)

			// If aborted while waiting, resolve null
			signal.addEventListener(
				"abort",
				() => {
					const idx = this.queueWaiters.indexOf(waiter)
					if (idx >= 0) this.queueWaiters.splice(idx, 1)
					resolve(null)
				},
				{ once: true },
			)
		})
	}

	private async startGlobalEventStream(signal: AbortSignal): Promise<void> {
		if (!this.client || this.streamRunning) return
		this.streamRunning = true

		try {
			const streamRes = await this.client.global.event()
			// biome-ignore lint/suspicious/noExplicitAny: GlobalEvent payload from SDK stream is typed as Event union but we treat generically
			const stream = streamRes.stream as AsyncIterable<{ directory?: string; payload?: any }>

			for await (const ge of stream) {
				if (signal.aborted) break
				const payload = ge?.payload
				if (!payload) continue

				const palotEvents = mapOpenCodeEventToPalot(payload, ge?.directory)
				for (const pe of palotEvents) {
					if (signal.aborted) break
					this.enqueueEvent(pe)
				}
			}
		} catch (err) {
			if (!signal.aborted) {
				this.enqueueEvent({
					type: "provider.disconnected",
					providerId: this.id,
					at: Date.now(),
					reason: err instanceof Error ? err.message : "SSE stream error",
				})
			}
		} finally {
			this.streamRunning = false
			if (!signal.aborted) {
				// auto attempt simple reconnect? For now just stay disconnected; host can reconnect
			}
		}
	}
}
