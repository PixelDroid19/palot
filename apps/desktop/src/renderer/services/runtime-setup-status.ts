import type { AgentCliDetection } from "../../preload/api"

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

	const [detections, openCode] = await Promise.all([
		window.palot.agentClis.detect(force),
		window.palot.onboarding.checkOpenCode(),
	])

	return detections.map((cli) => normalizeRuntimeStatus(cli, openCode))
}

function normalizeRuntimeStatus(
	cli: AgentCliDetection,
	openCode: Awaited<ReturnType<typeof window.palot.onboarding.checkOpenCode>>,
): RuntimeSetupStatus {
	if (cli.id === "opencode") {
		return {
			id: cli.id,
			displayName: cli.displayName,
			description: openCode.path ?? cli.binaryPath ?? "Checking...",
			installed: openCode.installed,
			version: openCode.version,
			compatible: openCode.compatible,
			warning: openCode.compatible ? null : (openCode.message ?? null),
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
