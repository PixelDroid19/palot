import { getBaseClient, getProjectClient } from "./connection-manager"

export const PROJECT_RUNTIME_CONNECTION_ERROR = "Not connected to project runtime"

export function requireRuntimeClient(directory: string | null) {
	const client = (directory ? getProjectClient(directory) : null) ?? getBaseClient()
	if (!client) throw new Error(PROJECT_RUNTIME_CONNECTION_ERROR)
	return client
}

export function requireRuntimeSessionClient(directory: string) {
	const client = getProjectClient(directory)
	if (!client) throw new Error(PROJECT_RUNTIME_CONNECTION_ERROR)
	return client
}

export const requireProjectRuntimeClient = requireRuntimeClient
export const requireProjectRuntimeSessionClient = requireRuntimeSessionClient
export const requireManagedRuntimeClient = requireRuntimeClient
export const requireManagedRuntimeProjectClient = requireRuntimeSessionClient
export const MANAGED_RUNTIME_CONNECTION_ERROR = PROJECT_RUNTIME_CONNECTION_ERROR
