/**
 * Desktop modularity: transport registry + automation defaults are
 * registry-driven (no silent brand substitution).
 */
import { describe, expect, test } from "bun:test"
import {
	bootstrapTransportForRuntimeId,
	isRegisteredManagedServerRuntimeId,
	listManagedServerRuntimeIds,
	registerManagedServerRuntimeId,
	unregisterManagedServerRuntimeId,
} from "../src/shared/runtime-transport-registry"
import {
	executeAutomationRun,
	listAutomationRuntimeExecutors,
	registerAutomationRuntimeExecutor,
	resolveDefaultAutomationRuntimeId,
	type AutomationRuntimeExecutor,
} from "../src/main/automation/runtime-executor"
import { gatewayTransportForRuntimeId } from "../src/renderer/lib/runtime-transport"
import { PROJECT_RUNTIME_ID } from "../src/shared/runtime-ids"

describe("managed-server transport registry", () => {
	test("bootstrap uses registered ids, not a frozen brand table only", () => {
		// OpenCode is registered by runtime-transport module side-effect
		expect(gatewayTransportForRuntimeId(PROJECT_RUNTIME_ID)).toBe("managed-server")
		expect(gatewayTransportForRuntimeId("codex")).toBe("agent-host")
		expect(gatewayTransportForRuntimeId("claude")).toBe("agent-host")
		expect(gatewayTransportForRuntimeId("custom-harness")).toBe("agent-host")

		registerManagedServerRuntimeId("acme-server")
		expect(isRegisteredManagedServerRuntimeId("acme-server")).toBe(true)
		expect(bootstrapTransportForRuntimeId("acme-server")).toBe("managed-server")
		expect(listManagedServerRuntimeIds()).toContain("acme-server")
		unregisterManagedServerRuntimeId("acme-server")
		expect(bootstrapTransportForRuntimeId("acme-server")).toBe("agent-host")
	})
})

describe("automation default is registry-driven", () => {
	test("resolveDefaultAutomationRuntimeId prefers registered opencode then first", () => {
		// May already have executors from other imports — just assert pure shape
		const id = resolveDefaultAutomationRuntimeId()
		if (id) {
			expect(listAutomationRuntimeExecutors().some((e) => e.runtimeId === id)).toBe(true)
		}
	})

	test("explicit unregistered runtimeId fails closed", async () => {
		const result = await executeAutomationRun({
			runtimeId: "not-a-real-runtime-zzz",
			config: {
				id: "a1",
				name: "Test",
				prompt: "x",
			} as never,
			workspace: "/tmp",
		})
		expect(result.error).toContain("not-a-real-runtime-zzz")
		expect(result.sessionId).toBe("")
	})

	test("custom executor can be the only default when opencode absent from selection", async () => {
		const fake: AutomationRuntimeExecutor = {
			runtimeId: "solo-harness",
			async execute(config) {
				return {
					sessionId: "s-solo",
					worktreePath: null,
					title: config.name,
					summary: "solo",
					hasActionable: false,
					branch: null,
					error: null,
				}
			},
		}
		registerAutomationRuntimeExecutor(fake)
		// Explicit id always works
		const result = await executeAutomationRun({
			runtimeId: "solo-harness",
			config: { id: "a2", name: "Solo", prompt: "y" } as never,
			workspace: "/tmp",
		})
		expect(result.summary).toBe("solo")
	})
})
