import type { SessionRuntimeDescriptor } from "../../preload/api"
import { loadRuntimeDescriptors } from "../lib/session-runtimes"

const isElectron = typeof window !== "undefined" && "palot" in window

export interface RuntimeSetupStatus {
	id: string
	displayName: string
	description: string
	installed: boolean
	version: string | null
	compatible: boolean
	warning: string | null
}

export async function loadRuntimeSetupStatuses(force = false): Promise<RuntimeSetupStatus[]> {
	if (!isElectron) return []

	return (await loadRuntimeDescriptors(force)).map((runtime) => normalizeRuntimeStatus(runtime))
}

function normalizeRuntimeStatus(runtime: SessionRuntimeDescriptor): RuntimeSetupStatus {
	return {
		id: runtime.id,
		displayName: runtime.displayName,
		description: runtime.setup.description,
		installed: runtime.installed,
		version: runtime.setup.version,
		compatible: runtime.setup.compatible,
		warning: runtime.setup.warning,
	}
}
