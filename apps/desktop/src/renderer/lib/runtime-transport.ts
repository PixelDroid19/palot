/**
 * Neutral runtime transport resolution for the product layer.
 *
 * Adapters declare capabilities (and optionally an explicit transport).
 * Session gateway and UI gate on this, not on hard-coded runtime product names.
 */
import { PROJECT_RUNTIME_ID } from "../../shared/runtime-ids"

export type RuntimeTransport = "managed-server" | "agent-host"

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
 * OpenCode's stable id is the only built-in managed-server adapter; all others
 * default to agent-host until descriptors override via capabilities.
 */
export function gatewayTransportForRuntimeId(runtimeId: string): RuntimeTransport {
	return runtimeId === PROJECT_RUNTIME_ID ? "managed-server" : "agent-host"
}
