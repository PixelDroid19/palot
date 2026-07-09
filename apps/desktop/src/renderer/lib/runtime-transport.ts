/**
 * Neutral runtime transport resolution for the product layer.
 *
 * Adapters declare capabilities (and optionally an explicit transport).
 * Session gateway and UI gate on this, not on hard-coded runtime product names.
 */
import {
	bootstrapTransportForRuntimeId,
	registerManagedServerRuntimeId,
	type RuntimeTransport,
} from "../../shared/runtime-transport-registry"
import { PROJECT_RUNTIME_ID } from "../../shared/runtime-ids"

export type { RuntimeTransport }

export type RuntimeTransportInput = {
	transport?: RuntimeTransport
	capabilities?: { managedLocalServer?: boolean }
	sessionCapabilities?: { supportsRuntimeConfiguration?: boolean }
	managedLocalServer?: boolean
	supportsRuntimeConfiguration?: boolean
}

// Default composition: OpenCode managed-server adapter is registered at module
// load. Custom builds can register additional managed-server ids or unregister
// this one via the transport registry.
registerManagedServerRuntimeId(PROJECT_RUNTIME_ID)

export function resolveRuntimeTransport(input: RuntimeTransportInput): RuntimeTransport {
	if (input.transport) return input.transport
	if (input.capabilities?.managedLocalServer) return "managed-server"
	if (input.sessionCapabilities?.supportsRuntimeConfiguration) return "managed-server"
	if (input.managedLocalServer) return "managed-server"
	if (input.supportsRuntimeConfiguration) return "managed-server"
	return "agent-host"
}

/**
 * Pure id → transport map used by the session gateway (no descriptor cache).
 * Managed-server ids come from the transport registry (not a brand switch).
 * Process adapters default to agent-host until descriptors override.
 */
export function gatewayTransportForRuntimeId(runtimeId: string): RuntimeTransport {
	return bootstrapTransportForRuntimeId(runtimeId)
}
