import { describe, expect, test } from "bun:test"
import {
	gatewayTransportForRuntimeId,
	resolveRuntimeTransport,
} from "../src/renderer/lib/runtime-transport"
import {
	syncManagedServerRuntimeIds,
} from "../src/shared/runtime-transport-registry"
import { OPENCODE_RUNTIME_ID, PROJECT_RUNTIME_ID } from "../src/shared/runtime-ids"

describe("runtime transport neutrality", () => {
	test("OpenCode id is managed-server only when registered/synced", () => {
		expect(PROJECT_RUNTIME_ID).toBe("opencode")
		expect(OPENCODE_RUNTIME_ID).toBe("opencode")
		syncManagedServerRuntimeIds([PROJECT_RUNTIME_ID])
		expect(gatewayTransportForRuntimeId(PROJECT_RUNTIME_ID)).toBe("managed-server")
		syncManagedServerRuntimeIds([])
		expect(gatewayTransportForRuntimeId(PROJECT_RUNTIME_ID)).toBe("agent-host")
	})

	test("process adapters (codex/claude) use agent-host transport", () => {
		expect(gatewayTransportForRuntimeId("codex")).toBe("agent-host")
		expect(gatewayTransportForRuntimeId("claude")).toBe("agent-host")
	})

	test("resolveRuntimeTransport prefers explicit transport on descriptor", () => {
		expect(
			resolveRuntimeTransport({
				id: "custom",
				transport: "managed-server",
			} as { id: string; transport: "managed-server" }),
		).toBe("managed-server")
	})
})
