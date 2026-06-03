/**
 * Provider adapter contract for the Palot agent platform.
 *
 * This is the boundary between any concrete agent backend (OpenCode, Codex,
 * Claude Code, or the Palot harness) and the rest of the system.
 *
 * All adapters MUST implement this exactly. UI, core, harness, automations,
 * and IPC speak ONLY in PalotCommand / PalotEvent. Adapters translate.
 *
 * Matches the spec in roadmap/core-agent-platform.md EXACTLY.
 *
 * Core is pure TS: no React, no Jotai, no Electron, no DOM, no Node builtins
 * (except in tests), no provider SDKs.
 */

import type { PalotEvent, SessionInfo, WorkspaceInfo } from "@palot/events"
import type { PalotCommand } from "./commands"

/** Input for establishing a connection to a provider backend. */
export interface ProviderConnectionInput {
	/** Base URL of the agent server (e.g. http://localhost:4096) */
	url: string
	/** Optional HTTP Authorization header value for remote/auth'd servers. */
	authHeader?: string | null
	/** Optional directory to scope the connection to a specific workspace/project. */
	directory?: string
	/**
	 * Optional custom fetch implementation.
	 * Desktop host passes the IPC-proxied fetch (from services/opencode createIpcFetch)
	 * so adapter commands and non-SSE calls bypass Chromium 6-conn limit.
	 * Browser/dev passes auth-wrapped or native fetch.
	 * Signature is the platform FetchFn (avoids bundling SDK types here).
	 */
	fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
	/**
	 * Whether to start the internal events stream on connect (default: true).
	 * Set to false for "dispatch-only" adapter instances used purely for
	 * command translation during migration (avoids duplicate /global/event SSE
	 * subscriptions alongside the legacy connection-manager path).
	 * PalotEvents for state still arrive via legacy mapper dual-feed.
	 */
	streamEvents?: boolean
}

/** Result of a successful connect(). */
export interface ProviderConnection {
	providerId: string
	connectedAt: number
	url: string
}

/** Filters/options for listing sessions from a provider. */
export interface ListSessionsInput {
	workspaceId?: string
	limit?: number
	roots?: boolean
	search?: string
}

/** Input for fetching a single session. */
export interface GetSessionInput {
	sessionId: string
	workspaceId?: string
}

/**
 * The canonical interface every agent provider adapter must implement.
 *
 * Providers publish facts via the `events()` async iterator (which must be
 * mapped to canonical PalotEvent, never leak native types).
 *
 * Consumers (hosts) dispatch PalotCommand; adapters translate to native calls.
 *
 * Connection lifecycle and errors surface as provider.connected / .disconnected
 * events (never throw from the iterator in a way that loses state).
 */
export interface AgentProviderAdapter {
	/** Stable id, e.g. "opencode", "codex", "claude-code", "harness". */
	id: string
	/** Human label for UI, e.g. "OpenCode". */
	label: string

	/**
	 * Establish connection to the backend.
	 * Starts any SSE / polling loops internally.
	 * Must emit a provider.connected event (via events()) on success.
	 */
	connect(input: ProviderConnectionInput): Promise<ProviderConnection>

	/**
	 * Tear down connection, stop streams, release resources.
	 * Must emit provider.disconnected (reason optional).
	 */
	disconnect(): Promise<void>

	/** List known workspaces/projects from the provider. */
	listWorkspaces(): Promise<WorkspaceInfo[]>

	/** List sessions, optionally scoped/filtered. */
	listSessions(input: ListSessionsInput): Promise<SessionInfo[]>

	/** Fetch one session by id (null if not found). */
	getSession(input: GetSessionInput): Promise<SessionInfo | null>

	/**
	 * Dispatch a user/system intention.
	 * Adapter translates to native provider action (e.g. promptAsync).
	 * Outcomes surface as events on the events() stream.
	 * Must be idempotent where possible; errors surface via disconnected or error events.
	 */
	dispatch(command: PalotCommand): Promise<void>

	/**
	 * Async iterable of canonical PalotEvents from this provider.
	 * The host subscribes (typically publishing the yielded events onto the
	 * shared EventBus on the correct channels).
	 *
	 * The signal aborts the stream (used for disconnect / provider switch).
	 * Implementations must be resilient: on transport error, emit
	 * provider.disconnected then (optionally) attempt internal reconnect and
	 * emit connected again.
	 */
	events(signal: AbortSignal): AsyncIterable<PalotEvent>
}
