/**
 * Pluggable session-runtime descriptor sources.
 *
 * Process adapters (Codex, Claude, custom harnesses) come from AgentHost.
 * Managed-server adapters (OpenCode today, future servers) register here so
 * describeSessionRuntimes does not hard-splice a single brand.
 */
import type { AgentRuntimeDescriptor, RuntimeTransport } from "@gcode/agent-host"

/** Product-facing runtime descriptor (process or managed-server). */
export interface SessionRuntimeDescriptor extends AgentRuntimeDescriptor {
	sessionCapabilities: {
		supportsSessionRevert: boolean
		supportsSessionSummarize: boolean
		supportsServerSlashCommands: boolean
		supportsFork: boolean
		supportsRuntimeConfiguration: boolean
		supportsWorktreeLaunch: boolean
		supportsServerHistory: boolean
	}
	transport: RuntimeTransport
	setup: {
		description: string
		version: string | null
		compatible: boolean
		warning: string | null
	}
}

export type RuntimeDescriptorSource = {
	/** Stable source id (e.g. "opencode", "custom-server"). */
	id: string
	describe: () => Promise<SessionRuntimeDescriptor | SessionRuntimeDescriptor[] | null>
}

const sources: RuntimeDescriptorSource[] = []

export function registerRuntimeDescriptorSource(source: RuntimeDescriptorSource): void {
	const idx = sources.findIndex((s) => s.id === source.id)
	if (idx >= 0) sources[idx] = source
	else sources.push(source)
}

export function unregisterRuntimeDescriptorSource(id: string): boolean {
	const idx = sources.findIndex((s) => s.id === id)
	if (idx < 0) return false
	sources.splice(idx, 1)
	return true
}

export function listRuntimeDescriptorSources(): RuntimeDescriptorSource[] {
	return [...sources]
}

export async function describeRegisteredManagedDescriptors(): Promise<SessionRuntimeDescriptor[]> {
	const out: SessionRuntimeDescriptor[] = []
	for (const source of sources) {
		const result = await source.describe()
		if (!result) continue
		if (Array.isArray(result)) out.push(...result)
		else out.push(result)
	}
	return out
}
