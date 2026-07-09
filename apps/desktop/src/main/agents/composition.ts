/**
 * Single composition surface for which runtimes Palot loads.
 *
 * Call {@link configureRuntimeComposition} before first getAgentHost /
 * describeSessionRuntimes / automation import side-effects settle. Defaults
 * match the full multi-runtime product; custom builds omit adapters here.
 */
import type { BuiltInProviderId } from "@palot/agent-host"
import { ALL_BUILTIN_PROVIDER_IDS } from "@palot/agent-host"

export interface RuntimeComposition {
	/**
	 * Process adapters (Codex/Claude) loaded into AgentHost.
	 * `false` = none; `true` = all; array = subset.
	 */
	processBuiltins?: boolean | readonly BuiltInProviderId[]
	/**
	 * Whether to register the OpenCode managed-server descriptor source.
	 * `false` unplugs OpenCode from pickers and transport bootstrap.
	 */
	includeOpenCode?: boolean
	/**
	 * Process automation executors to register (agent-host path).
	 * Defaults to the same set as processBuiltins when omitted.
	 */
	processAutomation?: boolean | readonly BuiltInProviderId[]
}

const DEFAULT: Required<{
	processBuiltins: boolean | readonly BuiltInProviderId[]
	includeOpenCode: boolean
	processAutomation: boolean | readonly BuiltInProviderId[]
}> = {
	processBuiltins: true,
	includeOpenCode: true,
	processAutomation: true,
}

let composition: RuntimeComposition = { ...DEFAULT }

export function configureRuntimeComposition(options: RuntimeComposition): void {
	composition = { ...composition, ...options }
}

export function getRuntimeComposition(): RuntimeComposition {
	return { ...composition }
}

/** Resolve which process built-in ids should load into AgentHost. */
export function resolveProcessBuiltinIds(): BuiltInProviderId[] {
	const opt = composition.processBuiltins
	if (opt === false) return []
	if (opt === true || opt === undefined) return [...ALL_BUILTIN_PROVIDER_IDS]
	return [...opt]
}

/** Resolve which process ids get automation executors. */
export function resolveProcessAutomationIds(): BuiltInProviderId[] {
	const opt = composition.processAutomation
	if (opt === false) return []
	if (opt === true || opt === undefined) {
		// Mirror process built-ins when automation not specified separately
		return resolveProcessBuiltinIds()
	}
	return [...opt]
}

export function shouldIncludeOpenCode(): boolean {
	return composition.includeOpenCode !== false
}
