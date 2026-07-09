/**
 * Bootstrap transport map for runtime ids before descriptors are loaded.
 *
 * Managed-server adapters register their ids here so the gateway does not
 * hard-code a single product brand. Process adapters need no registration
 * (default transport is agent-host).
 *
 * Main and renderer each have their own module instance. The renderer must
 * {@link syncManagedServerRuntimeIds} from descriptors returned by main
 * (which respect composition) — never hard-register a brand at module load.
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

/** Drop all registered managed-server ids (before re-sync from descriptors). */
export function clearManagedServerRuntimeIds(): void {
	managedServerIds.clear()
}

/**
 * Replace the managed-server id set with exactly these ids (from descriptors).
 * Ensures unplugging a managed adapter on main is reflected in the renderer.
 */
export function syncManagedServerRuntimeIds(runtimeIds: readonly string[]): void {
	managedServerIds.clear()
	for (const id of runtimeIds) {
		if (id) managedServerIds.add(id)
	}
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
