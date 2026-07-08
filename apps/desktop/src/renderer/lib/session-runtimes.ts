/**
 * Session runtimes Palot can start a conversation with. Every runtime renders
 * through the same chat surfaces; some runtimes happen to execute through the
 * managed runtime SDK and others through the generic agent-host bridge.
 *
 * Runtime descriptors are sourced in main (`describeRuntimes`): the managed
 * runtime is described there alongside CLI-backed runtimes, so the renderer
 * does not inject a special OpenCode option by hand anymore. This module keeps
 * a small cache the UI reads synchronously after
 * `loadRuntimeDescriptors()` resolves.
 */
import type { AgentRuntimeId, SessionRuntimeDescriptor } from "../../preload/api"

export type SessionRuntimeId = "opencode" | AgentRuntimeId
export const DEFAULT_SESSION_RUNTIME_ID: SessionRuntimeId = "opencode"
export interface SessionRuntimeOption {
	value: SessionRuntimeId
	label: string
}

const isElectron = typeof window !== "undefined" && "palot" in window

const DESCRIPTOR_TTL_MS = 60_000

let descriptorCache: { at: number; value: SessionRuntimeDescriptor[] } | null = null
let inflight: Promise<SessionRuntimeDescriptor[]> | null = null

/**
 * Fetch runtime descriptors from the core (cached briefly, so a CLI installed
 * or a catalog refreshed mid-session shows up). Safe to call from any
 * component; resolves to [] in browser mode.
 */
export function loadRuntimeDescriptors(force = false): Promise<SessionRuntimeDescriptor[]> {
	if (!force && descriptorCache && Date.now() - descriptorCache.at < DESCRIPTOR_TTL_MS) {
		return Promise.resolve(descriptorCache.value)
	}
	if (!isElectron) return Promise.resolve([])
	if (!force && inflight) return inflight
	inflight = window.palot.agentSession
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
export function runtimeDescriptors(): SessionRuntimeDescriptor[] {
	return descriptorCache?.value ?? []
}

export function runtimeDescriptor(id: SessionRuntimeId): SessionRuntimeDescriptor | undefined {
	return runtimeDescriptors().find((d) => d.id === id)
}

export function cliRuntimeDescriptors(
	descriptors: SessionRuntimeDescriptor[] = runtimeDescriptors(),
): SessionRuntimeDescriptor[] {
	return descriptors.filter((descriptor) => descriptor.mode === "cli")
}

export function installedCliRuntimeDescriptors(
	descriptors: SessionRuntimeDescriptor[] = runtimeDescriptors(),
): SessionRuntimeDescriptor[] {
	return cliRuntimeDescriptors(descriptors).filter((descriptor) => descriptor.installed)
}

export function isManagedRuntimeId(id: string): id is typeof DEFAULT_SESSION_RUNTIME_ID {
	return id === DEFAULT_SESSION_RUNTIME_ID
}

export function isCliRuntime(id: SessionRuntimeId): id is AgentRuntimeId {
	return !isManagedRuntimeId(id)
}

/** Human label for a runtime id (falls back to the id itself). */
export function runtimeLabel(id: SessionRuntimeId): string {
	return runtimeDescriptor(id)?.displayName ?? id
}

export function installedSessionRuntimeOptions(
	descriptors: SessionRuntimeDescriptor[] = runtimeDescriptors(),
): SessionRuntimeOption[] {
	return descriptors
		.filter((descriptor) => descriptor.installed)
		.map((descriptor) => ({
			value: descriptor.id,
			label: descriptor.displayName,
		}))
}
