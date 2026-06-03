import { atom } from "jotai"
import type { DiscoveredMdnsServer, ServerConfig } from "@desktop/preload"
import { DEFAULT_LOCAL_SERVER, DEFAULT_SERVER_SETTINGS } from "@desktop/shared"

// Platform core integration (dual write from legacy mapper + future adapter path).
// Imported here so connection-manager (imperative) and hooks can share reactive state.
// FullCoreState + initial from @palot/core (pure, allowed in renderer per IMPORT-ARCHITECTURE).
import type { FullCoreState } from "@palot/core"
import { initialFullCoreState } from "@palot/core"

// ============================================================
// Server configuration atoms (persisted via settings)
// ============================================================

/** All configured servers. Initialized from settings on app start. */
export const serversAtom = atom<ServerConfig[]>(DEFAULT_SERVER_SETTINGS.servers)

/** ID of the currently active server. */
export const activeServerIdAtom = atom<string>(DEFAULT_SERVER_SETTINGS.activeServerId)

/** Derived: the active server config object. Falls back to local if ID not found. */
export const activeServerConfigAtom = atom<ServerConfig>((get) => {
	const servers = get(serversAtom)
	const activeId = get(activeServerIdAtom)
	return servers.find((s) => s.id === activeId) ?? DEFAULT_LOCAL_SERVER
})

// ============================================================
// Live connection state atoms
// ============================================================

/** The URL of the currently connected server (set after connection is established). */
export const serverUrlAtom = atom<string | null>(null)

/** Whether we are currently connected (SSE stream active). */
export const serverConnectedAtom = atom<boolean>(false)

/**
 * Full core platform state (sessions, msgs, perms, q, workspaces, provider, automations, settings).
 * Fed in parallel (dual-write) by:
 *   - legacy OpenCode SSE path in connection-manager (via mapOpenCodeEventToPalot + rootReducer)
 *   - (future) direct from adapter.events() when we fully switch consumption.
 * React code subscribes via useAtomValue + derive* view models (no new objects in selectors).
 * This enables exposing core view models while old Jotai atoms continue 100% for no-breakage.
 */
export const platformCoreStateAtom = atom<FullCoreState>(initialFullCoreState)

/** Auth header for the current connection (null for local/unauthenticated). */
export const authHeaderAtom = atom<string | null>(null)

// ============================================================
// mDNS discovery atoms
// ============================================================

/** Servers discovered via mDNS on the local network. */
export const discoveredMdnsServersAtom = atom<DiscoveredMdnsServer[]>([])

/** Derived convenience atom for components that need connection + server info. */
export const connectionAtom = atom((get) => ({
	url: get(serverUrlAtom),
	connected: get(serverConnectedAtom),
	activeServer: get(activeServerConfigAtom),
}))
