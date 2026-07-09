/**
 * Bootstrap transport map for runtime ids before descriptors are loaded.
 *
 * Managed-server adapters register their ids here so the gateway does not
 * hard-code a single product brand. Process adapters need no registration
 * (default transport is agent-host).
 */

export type RuntimeTransport = "managed-server" | "agent-host"

const managedServerIds = new Set<string>()

/** Register a runtime id as managed-server for pre-descriptor gateway dispatch. */
export function registerManagedServerRuntimeId(runtimeId: string): void {
	managedServerIds.add(runtimeId)
}

export function unregisterManagedServerRuntimeId(runtimeId: string): void {
	managedServerIds.delete(runtimeId)
}

export function isRegisteredManagedServerRuntimeId(runtimeId: string): boolean {
	return managedServerIds.has(runtimeId)
}

export function listManagedServerRuntimeIds(): string[] {
	return [...managedServerIds]
}

/**
 * Pure bootstrap: registered managed-server ids → managed-server, else agent-host.
 * Prefer descriptor/capability resolution once descriptors are loaded.
 */
export function bootstrapTransportForRuntimeId(runtimeId: string): RuntimeTransport {
	return managedServerIds.has(runtimeId) ? "managed-server" : "agent-host"
}
