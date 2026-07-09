/**
 * Neutral runtime transport resolution for the product layer.
 *
 * Adapters declare capabilities (and optionally an explicit transport).
 * Session gateway and UI gate on this, not on hard-coded runtime product names.
 *
 * Do NOT register brands at module load — the renderer syncs managed-server
 * ids from descriptors loaded from main (composition-aware).
 */
import {
	bootstrapTransportForRuntimeId,
	type RuntimeTransport,
} from "../../shared/runtime-transport-registry"

export type { RuntimeTransport }

export type RuntimeTransportInput = {
	transport?: RuntimeTransport
	capabilities?: { managedLocalServer?: boolean }
	sessionCapabilities?: { supportsRuntimeConfiguration?: boolean }
	managedLocalServer?: boolean
	supportsRuntimeConfiguration?: boolean
}

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
 * Managed-server ids come from the transport registry (synced from descriptors).
 * Process adapters default to agent-host until descriptors override.
 */
export function gatewayTransportForRuntimeId(runtimeId: string): RuntimeTransport {
	return bootstrapTransportForRuntimeId(runtimeId)
}
