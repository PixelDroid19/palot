import { describe, expect, test } from "bun:test"
import {
	gatewayTransportForRuntimeId,
	resolveRuntimeTransport,
} from "../src/renderer/lib/runtime-transport"
import { PROJECT_RUNTIME_ID } from "../src/shared/runtime-ids"

/**
 * Gateway dispatch is by runtimeId → transport. OpenCode is not a special
 * product branch — it resolves to managed-server like any managed adapter.
 * Tests the pure dispatch helper the gateway uses (no Electron/Jotai side effects).
 */
describe("runtimeSessionGateway dispatch", () => {
	test("OpenCode runtimeId maps to managed-server gateway", () => {
		expect(gatewayTransportForRuntimeId(PROJECT_RUNTIME_ID)).toBe("managed-server")
		expect(gatewayTransportForRuntimeId("opencode")).toBe("managed-server")
	})

	test("Codex and Claude map to agent-host gateway", () => {
		expect(gatewayTransportForRuntimeId("codex")).toBe("agent-host")
		expect(gatewayTransportForRuntimeId("claude")).toBe("agent-host")
	})

	test("gateway does not special-case OpenCode by product name for dispatch key", () => {
		// Any unknown process-style id uses agent-host; only the known managed id
		// (opencode adapter) uses managed-server before descriptors load.
		expect(gatewayTransportForRuntimeId("some-plugin")).toBe("agent-host")
		const kinds = ["opencode", "codex", "claude"].map((id) => gatewayTransportForRuntimeId(id))
		expect(kinds).toEqual(["managed-server", "agent-host", "agent-host"])
	})

	test("capability flags alone select managed-server without naming OpenCode", () => {
		expect(
			resolveRuntimeTransport({
				supportsRuntimeConfiguration: true,
			}),
		).toBe("managed-server")
		expect(
			resolveRuntimeTransport({
				managedLocalServer: true,
			}),
		).toBe("managed-server")
	})
})
