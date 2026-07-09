/**
 * Session runtimes Palot can start a conversation with. Every runtime renders
 * through the same chat surfaces; adapters own wire protocols (managed server
 * vs agent-host process). Product code selects by `runtimeId` + descriptor
 * capabilities/transport — never by hard-coded "OpenCode vs CLI" branches.
 *
 * Runtime descriptors are sourced in main (`describeRuntimes`): OpenCode is
 * registered as one managed-server adapter alongside Codex and Claude. This
 * module keeps a small cache the UI reads synchronously after
 * `loadRuntimeDescriptors()` resolves.
 */
import type { AgentRuntimeId, SessionRuntimeDescriptor } from "../../preload/api"
import { PROJECT_RUNTIME_ID as SHARED_PROJECT_RUNTIME_ID } from "../../shared/runtime-ids"
import {
	gatewayTransportForRuntimeId,
	resolveRuntimeTransport,
	type RuntimeTransport,
} from "./runtime-transport"

export const PROJECT_RUNTIME_ID = SHARED_PROJECT_RUNTIME_ID
/** Concrete OpenCode adapter id (stable; not a product-base concept). */
export const OPENCODE_RUNTIME_ID = PROJECT_RUNTIME_ID
export type SessionRuntimeId = typeof PROJECT_RUNTIME_ID | AgentRuntimeId
export const DEFAULT_SESSION_RUNTIME_ID: SessionRuntimeId = PROJECT_RUNTIME_ID
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

/** Wire transport for a runtime id (capability-driven; adapters own protocols). */
export function runtimeTransportForId(id: SessionRuntimeId): RuntimeTransport {
	const descriptor = runtimeDescriptor(id)
	if (descriptor) return resolveRuntimeTransport(descriptor)
	// Before descriptors load, pure id map (OpenCode adapter id → managed-server).
	return gatewayTransportForRuntimeId(id)
}

/** Runtimes that speak agent-host (process adapters: Codex, Claude, …). */
export function processRuntimeDescriptors(
	descriptors: SessionRuntimeDescriptor[] = runtimeDescriptors(),
): SessionRuntimeDescriptor[] {
	return descriptors.filter(
		(descriptor) => resolveRuntimeTransport(descriptor) === "agent-host",
	)
}

/** @deprecated Use processRuntimeDescriptors — "CLI" is not a product branch name. */
export function cliRuntimeDescriptors(
	descriptors: SessionRuntimeDescriptor[] = runtimeDescriptors(),
): SessionRuntimeDescriptor[] {
	return processRuntimeDescriptors(descriptors)
}

export function installedProcessRuntimeDescriptors(
	descriptors: SessionRuntimeDescriptor[] = runtimeDescriptors(),
): SessionRuntimeDescriptor[] {
	return processRuntimeDescriptors(descriptors).filter((descriptor) => descriptor.installed)
}

/** @deprecated Use installedProcessRuntimeDescriptors */
export function installedCliRuntimeDescriptors(
	descriptors: SessionRuntimeDescriptor[] = runtimeDescriptors(),
): SessionRuntimeDescriptor[] {
	return installedProcessRuntimeDescriptors(descriptors)
}

export function isProjectRuntimeId(id: string): id is typeof DEFAULT_SESSION_RUNTIME_ID {
	return id === DEFAULT_SESSION_RUNTIME_ID
}

export function isOpenCodeRuntimeId(id: string): boolean {
	return id === OPENCODE_RUNTIME_ID
}

/**
 * True when this runtime uses the agent-host process transport.
 * Prefer {@link runtimeTransportForId} or descriptor capabilities in new code.
 *
 * @deprecated Prefer capability/transport checks so OpenCode is not special-cased by name.
 */
export function isCliRuntime(id: SessionRuntimeId): id is AgentRuntimeId {
	return runtimeTransportForId(id) === "agent-host"
}

/** True when the runtime uses the managed local server (OpenCode adapter today). */
export function usesManagedServerTransport(id: SessionRuntimeId): boolean {
	return runtimeTransportForId(id) === "managed-server"
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
