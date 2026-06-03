import type { OpencodeClient } from "@opencode-ai/sdk/v2/client"
import { coalescingKey } from "@desktop/shared"
import { FRAME_BUDGET_MS } from "@desktop/shared"
// Platform @palot/* integration (Subagent-B real production): dual-write events to bus + core reducer
// in parallel to legacy Jotai. Adapter used for new command path (dispatch). All new imports are
// @palot/* (no direct @opencode-ai/sdk added to this file's "new" surface).
import type { AgentProviderAdapter, FullCoreState, PalotCommand } from "@palot/core"
import { deriveSidebarViewModel, initialFullCoreState, rootReducer } from "@palot/core"
import { CHANNELS, eventBus, type Channel, type PalotEvent } from "@palot/events"
import { mapOpenCodeEventToPalot } from "@palot/agent-adapter-opencode"
import { platformCoreStateAtom } from "@/atoms/connection"
import { processEvent } from "@/atoms/actions/event-processor"
import { authHeaderAtom, serverConnectedAtom, serverUrlAtom } from "@/atoms/connection"
import { batchUpsertPartsAtom } from "@/atoms/parts"
import {
	SESSIONS_PAGE_SIZE,
	evictAllSessionsAtom,
	setProjectPaginationLoadingAtom,
	setSessionsAtom,
	updateProjectPaginationAtom,
} from "@/atoms/sessions"
import { appStore } from "@/atoms/store"
import {
	applyStreamingDelta,
	flushStreamingParts,
	isStreamingField,
	isStreamingPartType,
	streamingVersionFamily,
	updateStreamingPart,
} from "@/atoms/streaming"
import { createLogger } from "@/lib/logger"
import type { Event } from "@/lib/types"
import {
	connectToServer,
	disposeAllInstances,
	getSession,
	getSessionStatuses,
	listProjects,
	listSessions,
	subscribeToGlobalEvents,
} from "./opencode"

const log = createLogger("connection-manager")

// ============================================================
// Health check
// ============================================================

/**
 * Lightweight health probe: a single GET to /global/health with a 3s timeout.
 * Uses plain browser fetch (bypasses the SDK's retry wrapper and IPC proxy)
 * to avoid spamming the main process with failing requests when a server is down.
 */
async function checkHealth(url: string, authHeader: string | null): Promise<boolean> {
	const controller = new AbortController()
	const timeout = setTimeout(() => controller.abort(), 3000)
	try {
		const headers: Record<string, string> = {}
		if (authHeader) headers.Authorization = authHeader
		const res = await fetch(`${url}/global/health`, {
			signal: controller.signal,
			headers,
		})
		return res.ok
	} catch {
		return false
	} finally {
		clearTimeout(timeout)
	}
}

// ============================================================
// State — single server connection + per-project clients
// ============================================================

/** The single OpenCode server connection */
let connection: {
	url: string
	/** Auth header for remote servers (null for local/unauthenticated). */
	authHeader: string | null
	/** Base client (no directory) — used for SSE subscription */
	baseClient: OpencodeClient
	abortController: AbortController
} | null = null

/** Per-project SDK clients, keyed by directory path */
const projectClients = new Map<string, OpencodeClient>()

/**
 * Monotonically increasing ID for event loop instances.
 */
let eventLoopGeneration = 0

/**
 * Global reference to the SSE AbortController that survives Vite HMR
 * module replacement. When HMR replaces this module, the old module's
 * `connection` variable is lost, but the old event loop keeps running
 * with an unreachable AbortController. By storing it on `window`, the
 * new module can abort the stale loop on reconnect.
 */
const SSE_ABORT_KEY = "__palot_sse_abort__" as const

function getGlobalAbort(): AbortController | undefined {
	// biome-ignore lint/suspicious/noExplicitAny: accessing dynamic window property for SSE abort controller
	return (window as any)[SSE_ABORT_KEY]
}

function setGlobalAbort(controller: AbortController | null) {
	// biome-ignore lint/suspicious/noExplicitAny: accessing dynamic window property for SSE abort controller
	;(window as any)[SSE_ABORT_KEY] = controller
}

// ============================================================
// Public API
// ============================================================

// ============================================================
// PalotAgentHost / platform bridge (dual write, dispatch-only adapter)
// JSDoc per AGENTS.md and roadmap: thin compat layer so legacy 100% works while
// new @palot/core + @palot/events + @palot/agent-adapter-opencode drive commands
// and (via mapper) the canonical state. No breakage to SSE/automations/tray.
// All renderer new code paths go through services/backend reexports or these.
// ============================================================

/**
 * Helper: map PalotEvent type to canonical channel for bus publish.
 * Duplicated from harness (small) to keep connection-manager self contained during migration.
 * Used for dual feed from legacy mapper.
 */
function pickChannelForPalotEvent(event: PalotEvent): Channel {
	switch (event.type) {
		case "provider.connected":
		case "provider.disconnected":
			return CHANNELS.PROVIDER_CONNECTION
		case "workspace.discovered":
			return CHANNELS.WORKSPACE_DISCOVERY
		case "session.created":
		case "session.updated":
		case "session.deleted":
		case "session.status.changed":
			return CHANNELS.SESSION_LIFECYCLE
		case "message.upserted":
		case "message.removed":
		case "message.part.upserted":
		case "message.part.delta":
		case "message.part.removed":
			return CHANNELS.SESSION_MESSAGES
		case "permission.requested":
		case "permission.resolved":
			return CHANNELS.SESSION_PERMISSIONS
		case "question.requested":
		case "question.resolved":
			return CHANNELS.SESSION_QUESTIONS
		case "session.diff.updated":
			return CHANNELS.SESSION_DIFF
		case "automation.run.updated":
			return CHANNELS.AUTOMATION_RUNS
		case "settings.changed":
			return CHANNELS.SETTINGS_CHANGED
		default:
			return CHANNELS.SESSION_LIFECYCLE
	}
}

/** Module-level core state for platform (updated via rootReducer on PalotEvents). */
let platformCoreState: FullCoreState = { ...initialFullCoreState }

/** Dispatch-only adapter (streamEvents:false) for exercising adapter as command source without dupe SSE. */
let dispatchAdapter: AgentProviderAdapter | null = null

/**
 * Ensure the dispatch-only OpenCode adapter is connected (using injected fetch proxy when Electron).
 * Called from connectToOpenCode (after legacy) and from use-server before platform dispatch.
 * Uses streamEvents:false so only the battle-tested legacy SSE path (connection-manager)
 * produces events -> mapper -> bus + rootReducer + Jotai dual write.
 */
export async function ensurePlatformDispatchAdapter(
	url: string,
	authHeader?: string | null,
): Promise<void> {
	if (dispatchAdapter) {
		// Already wired for this server (simple; real host would track url)
		return
	}
	// Create via adapter package (renderer imports ONLY @palot/* here for new surface).
	const adapter = new (await import("@palot/agent-adapter-opencode").then(
		(m) => m.OpenCodeAgentAdapter,
	))() as AgentProviderAdapter & { connect: (i: any) => Promise<any> }

	// Get the proxy fetch creators from opencode service (they encapsulate IPC vs browser + retry + SSE guard).
	// This import is local service (no new "@opencode-ai/sdk" string in "new integration" code paths).
	const { createIpcFetch, createBrowserFetch } = await import("./opencode")
	const isElectron = typeof window !== "undefined" && "palot" in window
	const fetchFn = isElectron
		? createIpcFetch(authHeader ?? undefined)
		: createBrowserFetch(authHeader ?? undefined)

	await adapter.connect({
		url,
		authHeader: authHeader ?? null,
		fetch: fetchFn,
		streamEvents: false, // critical: no second /global/event subscription
	})

	dispatchAdapter = adapter
	log.info("Platform dispatch adapter connected (dispatch-only)", { url })
}

/**
 * Dispatch a PalotCommand through the OpenCodeAgentAdapter (new platform path).
 * This is how we wire "adapter as THE source for new sessions/prompts".
 * Requires prior ensurePlatformDispatchAdapter (called on server connect).
 * Model must be resolved (enforced inside adapter per critical footgun).
 * Legacy client calls continue for return values/optimistics (compat).
 */
export async function dispatchPlatformCommand(command: PalotCommand): Promise<void> {
	if (!dispatchAdapter) {
		throw new Error("Platform dispatch adapter not ready (ensure after connectToOpenCode)")
	}
	await dispatchAdapter.dispatch(command)
}

/** Return current platform core state (for services/hooks that want view models from core). */
export function getPlatformCoreState(): FullCoreState {
	return platformCoreState
}

/** Derive sidebar VM from current platform core state (pure, for new hook paths). */
export function derivePlatformSidebarViewModel() {
	return deriveSidebarViewModel(platformCoreState)
}

/** Feed a PalotEvent: publish to shared bus + rootReducer + update Jotai atom (dual write). */
function feedPalotEvent(ev: PalotEvent): void {
	const ch = pickChannelForPalotEvent(ev)
	eventBus.publish(ch, ev)
	platformCoreState = rootReducer(platformCoreState, ev)
	// Also update Jotai so usePlatform* hooks + React 19 derive with useMemo work reactively.
	appStore.set(platformCoreStateAtom, platformCoreState)
}

/**
 * Connect to an OpenCode server.
 * Starts SSE subscription for all-project events.
 *
 * @param url       Base URL of the OpenCode server
 * @param authHeader  Optional HTTP Authorization header for remote servers
 */
export async function connectToOpenCode(url: string, authHeader?: string | null): Promise<void> {
	// Disconnect existing connection if any
	if (connection) {
		log.info("Disconnecting previous connection", { url: connection.url })
		connection.abortController.abort()
		projectClients.clear()
	}

	// Also abort any stale SSE loop from a previous HMR module that we can't
	// reach through the module-level `connection` variable.
	const staleAbort = getGlobalAbort()
	if (staleAbort && !staleAbort.signal.aborted) {
		log.info("Aborting stale SSE connection from previous module")
		staleAbort.abort()
	}

	// Bump generation — any previous event loop will see it's stale and exit
	eventLoopGeneration++
	const gen = eventLoopGeneration

	const resolvedAuth = authHeader ?? null
	appStore.set(serverUrlAtom, url)
	appStore.set(authHeaderAtom, resolvedAuth)

	// Base client has no directory — used for SSE events (which cover all projects)
	const baseClient = connectToServer(url, { authHeader: resolvedAuth ?? undefined })
	const abortController = new AbortController()

	connection = { url, authHeader: resolvedAuth, baseClient, abortController }
	setGlobalAbort(abortController)

	log.info("Connecting to OpenCode server", { url, authenticated: !!resolvedAuth, generation: gen })

	// Reset platform core state for the new server connection (mirrors Jotai session eviction on server switch).
	platformCoreState = { ...initialFullCoreState }
	appStore.set(platformCoreStateAtom, platformCoreState)

	// Ping the server to check if it's reachable before starting the event loop.
	// This sets the initial connected state accurately instead of optimistically.
	const healthy = await checkHealth(url, resolvedAuth)
	appStore.set(serverConnectedAtom, healthy)
	if (healthy) {
		log.info("Server health check passed", { url })
	} else {
		log.warn("Server health check failed, will retry via SSE loop", { url })
	}

	// Start SSE event loop in the background.
	// Connected state is updated when the SSE stream opens or fails.
	startEventLoop(baseClient, abortController.signal, gen)

	// ============================================================
	// New platform path: ensure dispatch-only adapter (exercises @palot/agent-adapter-opencode
	// for commands like session.prompt / create using resolved model + no dupe SSE).
	// This makes adapter "THE source" for new prompts/sessions while legacy path (and its
	// mapper dual feed) keeps Jotai/SSE/automations 100% working.
	// Fire-and-forget; errors logged only.
	// ============================================================
	ensurePlatformDispatchAdapter(url, resolvedAuth).catch((e) =>
		log.warn("ensurePlatformDispatchAdapter failed (non-fatal for legacy)", e),
	)
}

/**
 * List all projects known to the OpenCode server via the API.
 * Uses the base client (no directory scope) since project.list() is global.
 */
export async function loadAllProjects() {
	const client = getBaseClient()
	if (!client) {
		log.warn("Cannot load projects: not connected to server")
		return []
	}
	try {
		const projects = await listProjects(client)
		log.info("Loaded projects from API", { count: projects.length })
		return projects
	} catch (err) {
		log.error("Failed to load projects from API", err)
		return []
	}
}

/**
 * Load sessions for a specific project directory from the server.
 * Merges them into the Jotai store.
 *
 * @param directory    The project's main worktree directory
 * @param sandboxDirs  Known sandbox (worktree) directories for this project,
 *                     used to restore worktree metadata on sessions after reload
 * @param options      Optional filtering/pagination for session list
 */
export async function loadProjectSessions(
	directory: string,
	sandboxDirs?: Set<string>,
	options?: { limit?: number; roots?: boolean; search?: string },
): Promise<void> {
	const client = getProjectClient(directory)
	if (!client) return

	// Set loading state so the sidebar shows a spinner
	if (options?.limit) {
		appStore.set(setProjectPaginationLoadingAtom, directory)
	}

	try {
		const [sessions, statuses] = await Promise.all([
			listSessions(client, options),
			getSessionStatuses(client),
		])
		log.info("Loaded sessions for project", {
			directory,
			count: sessions.length,
			limit: options?.limit,
			roots: options?.roots,
		})
		appStore.set(setSessionsAtom, { sessions, statuses, directory, sandboxDirs })

		// Update pagination state if a limit was specified
		if (options?.limit) {
			appStore.set(updateProjectPaginationAtom, {
				directory,
				fetchedCount: sessions.length,
				limit: options.limit,
			})
		}
	} catch (err) {
		log.error("Failed to load sessions", { directory }, err)
		// Reset loading state on error
		if (options?.limit) {
			appStore.set(updateProjectPaginationAtom, {
				directory,
				fetchedCount: 0,
				limit: options.limit,
			})
		}
	}
}

/**
 * Load more sessions for a project by increasing the fetch limit.
 * Called when the user clicks "Load more" in the sidebar.
 *
 * @param directory    The project's main worktree directory
 * @param currentLimit The current limit (will be increased by SESSIONS_PAGE_SIZE)
 */
export async function loadMoreProjectSessions(
	directory: string,
	currentLimit: number,
): Promise<void> {
	const nextLimit = currentLimit + SESSIONS_PAGE_SIZE
	log.info("Loading more sessions", { directory, currentLimit, nextLimit })
	appStore.set(setProjectPaginationLoadingAtom, directory)

	const client = getProjectClient(directory)
	if (!client) {
		log.warn("Cannot load more sessions: no client for directory", { directory })
		return
	}

	try {
		const [sessions, statuses] = await Promise.all([
			listSessions(client, { limit: nextLimit, roots: true }),
			getSessionStatuses(client),
		])
		log.info("Loaded more sessions for project", {
			directory,
			count: sessions.length,
			limit: nextLimit,
		})
		appStore.set(setSessionsAtom, { sessions, statuses, directory })
		appStore.set(updateProjectPaginationAtom, {
			directory,
			fetchedCount: sessions.length,
			limit: nextLimit,
		})
	} catch (err) {
		log.error("Failed to load more sessions", { directory }, err)
		// Reset loading state on error
		appStore.set(updateProjectPaginationAtom, {
			directory,
			fetchedCount: currentLimit,
			limit: currentLimit,
		})
	}
}

/**
 * Get or create a project-scoped SDK client.
 *
 * If the module-level connection was lost (e.g. Vite HMR wiped it) but
 * the Jotai store still knows the server URL, we transparently reconnect.
 */
export function getProjectClient(directory: string): OpencodeClient | null {
	if (!connection) {
		// HMR recovery: module state is gone but the store remembers the URL
		const storeUrl = appStore.get(serverUrlAtom)
		if (storeUrl) {
			log.warn("Connection lost (likely HMR), reconnecting to", { url: storeUrl })

			// Abort any stale SSE loop from the previous module
			const staleAbort = getGlobalAbort()
			if (staleAbort && !staleAbort.signal.aborted) {
				log.info("Aborting stale SSE connection from previous module")
				staleAbort.abort()
			}

			const storeAuth = appStore.get(authHeaderAtom)
			const baseClient = connectToServer(storeUrl, { authHeader: storeAuth ?? undefined })
			const abortController = new AbortController()
			eventLoopGeneration++
			connection = { url: storeUrl, authHeader: storeAuth, baseClient, abortController }
			setGlobalAbort(abortController)
			startEventLoop(baseClient, abortController.signal, eventLoopGeneration)
			// Connected state is set by startEventLoop once SSE actually opens
		} else {
			return null
		}
	}

	let client = projectClients.get(directory)
	if (!client) {
		client = connectToServer(connection.url, {
			directory,
			authHeader: connection.authHeader ?? undefined,
		})
		projectClients.set(directory, client)
	}
	return client
}

/**
 * Fetch a single session by ID using the global (non-directory-scoped) client.
 *
 * Used as a fallback when navigating directly to a session that is not yet in
 * the Jotai store — for example, subagent sessions that arrived while the SSE
 * stream was reconnecting, or sessions on a VPS where the initial batch load
 * only fetches root sessions.
 *
 * Returns `null` if the session is not found, the server is unreachable, or
 * no connection has been established.
 */
export async function fetchSessionById(sessionId: string): Promise<import("../lib/types").Session | null> {
	const client = getBaseClient()
	if (!client) return null
	return getSession(client, sessionId)
}

/**
 * Get the base SDK client (no directory scope).
 * Used for global operations like auth set/remove, provider list, global config.
 * Returns null if not connected.
 */
export function getBaseClient(): OpencodeClient | null {
	if (!connection) {
		// HMR recovery
		const storeUrl = appStore.get(serverUrlAtom)
		if (storeUrl) {
			const storeAuth = appStore.get(authHeaderAtom)
			const baseClient = connectToServer(storeUrl, { authHeader: storeAuth ?? undefined })
			const abortController = new AbortController()
			eventLoopGeneration++
			connection = { url: storeUrl, authHeader: storeAuth, baseClient, abortController }
			setGlobalAbort(abortController)
			startEventLoop(baseClient, abortController.signal, eventLoopGeneration)
			// Connected state is set by startEventLoop once SSE actually opens
		} else {
			return null
		}
	}
	return connection.baseClient
}

/**
 * Check if we're connected to the OpenCode server.
 */
export function isConnected(): boolean {
	return connection !== null
}

/**
 * Get the server URL, or null if not connected.
 */
export function getServerUrl(): string | null {
	return connection?.url ?? null
}

/**
 * Reload all OpenCode configuration by disposing all server instances.
 * This forces the server to re-read config files, agents, skills, commands, etc.
 * The resulting SSE events automatically invalidate UI queries.
 */
export async function reloadConfig(): Promise<void> {
	if (!connection) {
		log.warn("Cannot reload config: not connected to server")
		return
	}
	log.info("Reloading OpenCode config (disposing all instances)")
	await disposeAllInstances(connection.baseClient)
}

/**
 * Disconnect from the OpenCode server.
 */
export function disconnect(): void {
	log.info("Disconnecting from OpenCode server")
	if (connection) {
		connection.abortController.abort()
		connection = null
		projectClients.clear()
	}
	setGlobalAbort(null)
	eventLoopGeneration++
	appStore.set(evictAllSessionsAtom)
	appStore.set(serverConnectedAtom, false)

	// Platform dispatch adapter cleanup (non-blocking; keeps legacy automations etc unaffected).
	if (dispatchAdapter) {
		void (dispatchAdapter as any)
			.disconnect?.()
			.catch(() => {})
			.finally(() => {
				dispatchAdapter = null
			})
	}
	// Reset platform core state on full disconnect (mirrors evictAllSessionsAtom).
	platformCoreState = { ...initialFullCoreState }
	appStore.set(platformCoreStateAtom, platformCoreState)
}

// ============================================================
// Event Batching (OpenCode-inspired 16ms flush with coalescing)
// ============================================================

function createEventBatcher() {
	let queue: Event[] = []
	const coalesced = new Map<string, Event>()
	let scheduled: number | undefined
	let lastFlush = 0

	function flush() {
		const events = [...queue, ...coalesced.values()]
		queue = []
		coalesced.clear()
		scheduled = undefined
		lastFlush = performance.now()

		if (events.length === 0) return

		// Collect non-streaming parts across all events in the batch so we can
		// write them in a single batchUpsertPartsAtom call instead of N individual
		// upsertPartAtom calls. This significantly reduces Jotai atom writes and
		// React reconciliation passes during heavy tool-call activity.
		const batchedParts: import("../lib/types").Part[] = []
		const batchedPartSessionIds = new Set<string>()

		for (const event of events) {
			if (event.type === "message.part.updated" && !isStreamingPartType(event.properties.part)) {
				batchedParts.push(event.properties.part)
				batchedPartSessionIds.add(event.properties.part.sessionID)
			} else {
				processEvent(event)
			}
		}

		// Flush collected non-streaming parts in a single batch write
		if (batchedParts.length > 0) {
			appStore.set(batchUpsertPartsAtom, batchedParts)
			// Bump per-session streaming version so the UI picks up the new parts
			for (const sid of batchedPartSessionIds) {
				appStore.set(streamingVersionFamily(sid), (v: number) => v + 1)
			}
		}
	}

	function enqueue(event: Event) {
		// Fast path: route high-frequency text/reasoning part updates to streaming buffer
		if (event.type === "message.part.updated") {
			const part = event.properties.part
			if (isStreamingPartType(part)) {
				updateStreamingPart(part)
				const key = coalescingKey(event)
				if (key) coalesced.set(key, event)
				if (scheduled !== undefined) return
				const elapsed = performance.now() - lastFlush
				if (elapsed < FRAME_BUDGET_MS) {
					scheduled = requestAnimationFrame(flush)
				} else {
					flush()
				}
				return
			}
		}

		// Fast path: route incremental text/reasoning deltas to streaming buffer
		if (event.type === "message.part.delta") {
			const { messageID, partID, field, delta, sessionID } = event.properties
			if (isStreamingField(field)) {
				const applied = applyStreamingDelta(messageID, partID, field, delta, sessionID)
				if (applied) {
					const key = coalescingKey(event)
					if (key) coalesced.set(key, event)
					if (scheduled !== undefined) return
					const elapsed = performance.now() - lastFlush
					if (elapsed < FRAME_BUDGET_MS) {
						scheduled = requestAnimationFrame(flush)
					} else {
						flush()
					}
					return
				}
				// Part not in streaming buffer yet, fall through to normal processing
			}
		}

		// When a session goes idle, flush streaming parts to main store
		if (event.type === "session.status" && event.properties.status.type === "idle") {
			const flushedParts = flushStreamingParts()
			if (flushedParts.length > 0) {
				appStore.set(batchUpsertPartsAtom, flushedParts)
			}
		}

		const key = coalescingKey(event)
		if (key) {
			coalesced.set(key, event)
		} else {
			queue.push(event)
		}

		if (scheduled !== undefined) return

		const elapsed = performance.now() - lastFlush
		if (elapsed < FRAME_BUDGET_MS) {
			scheduled = requestAnimationFrame(flush)
		} else {
			flush()
		}
	}

	function dispose(discard = false) {
		if (scheduled !== undefined) {
			cancelAnimationFrame(scheduled)
			scheduled = undefined
		}
		if (discard) {
			// Stale connection — drop buffered events instead of flushing them.
			// Flushing would re-add sessions to the store after sessionIdsAtom has
			// already been cleared by triggerServerSwitch(), causing stale sessions
			// from the previous server to reappear in the sidebar.
			queue = []
			coalesced.clear()
		} else {
			flush()
		}
	}

	return { enqueue, dispose }
}

// ============================================================
// SSE Event Loop
// ============================================================

async function startEventLoop(
	client: OpencodeClient,
	signal: AbortSignal,
	generation: number,
): Promise<void> {
	let retryDelay = 1000

	const isStale = () => signal.aborted || generation !== eventLoopGeneration

	/** Only write serverConnectedAtom if this event loop is still the active one. */
	const setConnected = (value: boolean) => {
		if (!isStale()) appStore.set(serverConnectedAtom, value)
	}

	log.info("SSE event loop started", { generation })

	while (!isStale()) {
		// Before opening the SSE stream, check if the server is reachable.
		// This avoids firing expensive IPC/SSE requests against a dead server.
		// On the first iteration the caller already ran a health check, so
		// we only probe when retrying (retryDelay > 1000 means we already failed once).
		if (retryDelay > 1000 || !appStore.get(serverConnectedAtom)) {
			const healthy = await checkHealth(connection?.url ?? "", connection?.authHeader ?? null)
			if (isStale()) break
			setConnected(healthy)
			if (!healthy) {
				log.warn("Server health check failed, backing off", { generation, retryDelay })
				await new Promise((resolve) => setTimeout(resolve, retryDelay))
				retryDelay = Math.min(retryDelay * 2, 30000)
				continue
			}
		}

		const batcher = createEventBatcher()

		try {
			log.debug("Opening SSE stream", { generation })
			const stream = await subscribeToGlobalEvents(client)
			if (isStale()) break
			retryDelay = 1000
			log.info("SSE stream connected", { generation })

			// SSE stream opened successfully, server is reachable
			setConnected(true)

			for await (const globalEvent of stream) {
				if (isStale()) break
				const event = globalEvent.payload
				if (event) {
					batcher.enqueue(event)

					// ============================================================
					// Dual-write to @palot/events bus + @palot/core rootReducer (parallel to Jotai).
					// Uses the adapter's pure mapper so PalotEvents are canonical (no SDK leak to new paths).
					// This is the production feed from the real OpenCode SSE; new platform commands
					// (via dispatchAdapter) produce side-effects that arrive here and populate bus/core.
					// Safe: old Jotai (processEvent + atoms) + new (bus + reducer + platformCoreStateAtom) both updated.
					// No breakage to SSE reconnect/batching/HMR/automations (they use legacy Event path).
					// ============================================================
					try {
						const palotEvents = mapOpenCodeEventToPalot(event as any, globalEvent.directory)
						for (const pe of palotEvents) {
							feedPalotEvent(pe)
						}
					} catch (mapErr) {
						log.warn("Failed to map legacy event to PalotEvent for platform bus/core (safe, continue)", mapErr)
					}
				}
			}
			if (!isStale()) {
				log.warn("SSE stream ended (server closed connection)", { generation })
				setConnected(false)
			}
		} catch (err) {
			if (isStale()) break
			log.error("SSE stream disconnected", { generation, retryDelay }, err)
			setConnected(false)
		} finally {
			// Discard pending events when the loop is stale (server switched / disconnected).
			// Flushing stale events would re-populate session atoms that were just cleared.
			batcher.dispose(isStale())
		}

		if (isStale()) break

		log.info("Reconnecting SSE in", { delayMs: retryDelay, generation })
		await new Promise((resolve) => setTimeout(resolve, retryDelay))
		retryDelay = Math.min(retryDelay * 2, 30000)
	}

	log.info("SSE event loop exited", { generation, stale: generation !== eventLoopGeneration })
}
