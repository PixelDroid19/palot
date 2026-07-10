/**
 * Removed OpenCode HTTP runtime lifecycle.
 *
 * OpenCode is launched by `@gcode/agent-host` with `opencode acp`. These
 * compatibility exports remain temporarily so older renderer/preload modules
 * fail clearly while they migrate, but no server process can be created here.
 */

export interface ProjectRuntimeServer {
	url: string
	pid: number | null
	managed: boolean
}

export type ManagedRuntimeServer = ProjectRuntimeServer
export interface OpenCodeServerProcess extends ProjectRuntimeServer {}

const REMOVED_MESSAGE = "OpenCode HTTP runtime has been removed; use agentSession ACP"

export async function ensureProjectRuntimeServer(): Promise<ProjectRuntimeServer> {
	throw new Error(REMOVED_MESSAGE)
}

export const ensureManagedRuntimeServer = ensureProjectRuntimeServer
export const ensureServer = ensureProjectRuntimeServer

export function getProjectRuntimeUrl(): string | null {
	return null
}

export const getManagedRuntimeUrl = getProjectRuntimeUrl
export const getServerUrl = getProjectRuntimeUrl

export function getProjectRuntimeAuthHeader(): string | null {
	return null
}

export const getManagedRuntimeAuthHeader = getProjectRuntimeAuthHeader
export const getServerAuthHeader = getProjectRuntimeAuthHeader

export function stopProjectRuntimeServer(): boolean {
	return false
}

export const stopManagedRuntimeServer = stopProjectRuntimeServer
export const stopServer = stopProjectRuntimeServer

export async function restartProjectRuntimeServer(): Promise<ProjectRuntimeServer> {
	throw new Error(REMOVED_MESSAGE)
}

export const restartManagedRuntimeServer = restartProjectRuntimeServer
export const restartServer = restartProjectRuntimeServer
