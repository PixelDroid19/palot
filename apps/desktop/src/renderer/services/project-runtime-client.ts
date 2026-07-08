import { getBaseClient, getProjectClient } from "./connection-manager"

export const PROJECT_RUNTIME_CONNECTION_ERROR = "Not connected to project runtime"

export function requireProjectRuntimeClient(directory: string | null) {
	const client = (directory ? getProjectClient(directory) : null) ?? getBaseClient()
	if (!client) throw new Error(PROJECT_RUNTIME_CONNECTION_ERROR)
	return client
}

export function requireProjectRuntimeSessionClient(directory: string) {
	const client = getProjectClient(directory)
	if (!client) throw new Error(PROJECT_RUNTIME_CONNECTION_ERROR)
	return client
}

export const requireManagedRuntimeClient = requireProjectRuntimeClient
export const requireManagedRuntimeProjectClient = requireProjectRuntimeSessionClient
export const MANAGED_RUNTIME_CONNECTION_ERROR = PROJECT_RUNTIME_CONNECTION_ERROR
