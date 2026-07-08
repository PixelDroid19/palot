/**
 * Session runtimes Palot can start a conversation with. Every runtime renders
 * through the same chat surfaces; some runtimes happen to execute through the
 * OpenCode SDK and others through the generic agent-host bridge.
 *
 * CLI model catalogs are NOT hardcoded here: they come from the agent-host
 * core (`describeRuntimes`), which reads each runtime's own source of truth.
 * This module keeps a small cache the UI reads synchronously after
 * `loadRuntimeDescriptors()` resolves.
 */
import type { AgentRuntimeDescriptor, AgentRuntimeId } from "../../preload/api"

export type SessionRuntimeId = "opencode" | AgentRuntimeId
export const DEFAULT_SESSION_RUNTIME_ID: SessionRuntimeId = "opencode"

const isElectron = typeof window !== "undefined" && "palot" in window

const DESCRIPTOR_TTL_MS = 60_000

let descriptorCache: { at: number; value: AgentRuntimeDescriptor[] } | null = null
let inflight: Promise<AgentRuntimeDescriptor[]> | null = null

/**
 * Fetch runtime descriptors from the core (cached briefly, so a CLI installed
 * or a catalog refreshed mid-session shows up). Safe to call from any
 * component; resolves to [] in browser mode.
 */
export function loadRuntimeDescriptors(): Promise<AgentRuntimeDescriptor[]> {
	if (descriptorCache && Date.now() - descriptorCache.at < DESCRIPTOR_TTL_MS) {
		return Promise.resolve(descriptorCache.value)
	}
	if (!isElectron) return Promise.resolve([])
	inflight ??= window.palot.agentSession
		.describeRuntimes()
		.then((descriptors) => {
			descriptorCache = { at: Date.now(), value: descriptors }
			inflight = null
			return descriptors
		})
		.catch(() => {
			inflight = null
			return descriptorCache?.value ?? []
		})
	return inflight
}

/** Synchronous view of the loaded descriptors ([] until loaded). */
export function runtimeDescriptors(): AgentRuntimeDescriptor[] {
	return descriptorCache?.value ?? []
}

export function runtimeDescriptor(id: SessionRuntimeId): AgentRuntimeDescriptor | undefined {
	return runtimeDescriptors().find((d) => d.id === id)
}

export function isCliRuntime(id: SessionRuntimeId): id is AgentRuntimeId {
	return id !== "opencode"
}

/** Human label for a runtime id (falls back to the id itself). */
export function runtimeLabel(id: SessionRuntimeId): string {
	if (id === "opencode") return "OpenCode"
	return runtimeDescriptor(id)?.displayName ?? id
}
