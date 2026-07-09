/**
 * Host tool plane completeness — heal path for long-lived AgentHost singletons.
 *
 * Electron-free so unit tests can drive the real heal without the desktop
 * main-process graph (app, shell, …).
 */
import type { AgentHost } from "@gcode/agent-host"

/** Core host tools that must always be present for agentic multi-harness scale. */
export const REQUIRED_HOST_TOOLS = [
	"gcode_list_agents",
	"gcode_delegate",
	"gcode_list_subagents",
	"gcode_run_subagent",
	"gcode_automation_list",
	"gcode_system_run",
	"gcode_browser_open",
] as const

export function listMissingHostTools(host: AgentHost): string[] {
	return REQUIRED_HOST_TOOLS.filter((name) => !host.tools.has(name))
}

/**
 * Hot-upgrade heal: if the host is missing newer plane tools (e.g. subagents
 * after an older main process built the singleton), reinstall defaults + backends.
 *
 * @returns which names were missing before heal (empty if no-op)
 */
export function ensureHostToolPlaneComplete(
	host: AgentHost,
	installBackends: (host: AgentHost) => void,
): string[] {
	const missing = listMissingHostTools(host)
	if (missing.length === 0) return []
	host.installDefaultHostTools()
	installBackends(host)
	return missing
}
