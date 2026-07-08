import { getBaseClient, getProjectClient } from "./connection-manager"

export const MANAGED_RUNTIME_CONNECTION_ERROR = "Not connected to managed runtime"

export function requireManagedRuntimeProjectClient(directory: string) {
	const client = getProjectClient(directory)
	if (!client) throw new Error(MANAGED_RUNTIME_CONNECTION_ERROR)
	return client
}

export function requireManagedRuntimeClient(directory: string | null) {
	const client = (directory ? getProjectClient(directory) : null) ?? getBaseClient()
	if (!client) throw new Error(MANAGED_RUNTIME_CONNECTION_ERROR)
	return client
}
