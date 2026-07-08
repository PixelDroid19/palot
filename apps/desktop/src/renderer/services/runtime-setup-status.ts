import type { AgentCliDetection } from "../../preload/api"
import { isManagedRuntimeId } from "../lib/session-runtimes"

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

	const [detections, managedRuntime] = await Promise.all([
		window.palot.agentClis.detect(force),
		window.palot.onboarding.checkManagedRuntime(),
	])

	return detections.map((cli) => normalizeRuntimeStatus(cli, managedRuntime))
}

function normalizeRuntimeStatus(
	cli: AgentCliDetection,
	managedRuntime: Awaited<ReturnType<typeof window.palot.onboarding.checkManagedRuntime>>,
): RuntimeSetupStatus {
	if (isManagedRuntimeId(cli.id)) {
		return {
			id: cli.id,
			displayName: cli.displayName,
			description: managedRuntime.path ?? cli.binaryPath ?? "Checking...",
			installed: managedRuntime.installed,
			version: managedRuntime.version,
			compatible: managedRuntime.compatible,
			warning: managedRuntime.compatible ? null : (managedRuntime.message ?? null),
		}
	}

	return {
		id: cli.id,
		displayName: cli.displayName,
		description: cli.installed ? (cli.binaryPath ?? "") : cli.installHint,
		installed: cli.installed,
		version: cli.version,
		compatible: cli.installed,
		warning: null,
	}
}
