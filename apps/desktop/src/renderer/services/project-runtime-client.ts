import {
	MANAGED_RUNTIME_CONNECTION_ERROR,
	requireManagedRuntimeClient,
	requireManagedRuntimeProjectClient,
} from "./managed-runtime-client"

export const PROJECT_RUNTIME_CONNECTION_ERROR = MANAGED_RUNTIME_CONNECTION_ERROR

export function requireProjectRuntimeClient(directory: string | null) {
	return requireManagedRuntimeClient(directory)
}

export function requireProjectRuntimeSessionClient(directory: string) {
	return requireManagedRuntimeProjectClient(directory)
}

export const requireManagedRuntimeClient = requireProjectRuntimeClient
export const requireManagedRuntimeProjectClient = requireProjectRuntimeSessionClient
