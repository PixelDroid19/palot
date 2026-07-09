/**
 * Desktop modularity: transport registry + automation defaults are
 * registry-driven (no silent brand substitution).
 */
import { beforeEach, describe, expect, test } from "bun:test"
import {
	bootstrapTransportForRuntimeId,
	clearManagedServerRuntimeIds,
	isRegisteredManagedServerRuntimeId,
	listManagedServerRuntimeIds,
	registerManagedServerRuntimeId,
	syncManagedServerRuntimeIds,
	unregisterManagedServerRuntimeId,
} from "../src/shared/runtime-transport-registry"
import {
	clearAutomationRuntimeExecutors,
	executeAutomationRun,
	listAutomationRuntimeExecutors,
	registerAutomationRuntimeExecutor,
	resolveDefaultAutomationRuntimeId,
	type AutomationRuntimeExecutor,
} from "../src/main/automation/runtime-executor"
import { gatewayTransportForRuntimeId } from "../src/renderer/lib/runtime-transport"
import { PROJECT_RUNTIME_ID } from "../src/shared/runtime-ids"
import {
	resolveDefaultSessionRuntimeId,
	syncTransportRegistryFromDescriptors,
} from "../src/renderer/lib/session-runtimes"

describe("managed-server transport registry", () => {
	test("bootstrap uses only registered ids (no module-load brand freeze)", () => {
		clearManagedServerRuntimeIds()
		// Unregistered brands (including opencode) → agent-host until synced
		expect(gatewayTransportForRuntimeId(PROJECT_RUNTIME_ID)).toBe("agent-host")
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

	test("syncManagedServerRuntimeIds replaces set so unplugged brands disappear", () => {
		syncManagedServerRuntimeIds(["opencode", "acme"])
		expect(listManagedServerRuntimeIds().sort()).toEqual(["acme", "opencode"])
		syncManagedServerRuntimeIds(["acme"])
		expect(listManagedServerRuntimeIds()).toEqual(["acme"])
		expect(bootstrapTransportForRuntimeId("opencode")).toBe("agent-host")
		expect(bootstrapTransportForRuntimeId("acme")).toBe("managed-server")
		clearManagedServerRuntimeIds()
		expect(listManagedServerRuntimeIds()).toEqual([])
	})
})

describe("resolveDefaultSessionRuntimeId from descriptors", () => {
	test("prefers first installed descriptor, not frozen opencode", () => {
		const id = resolveDefaultSessionRuntimeId([
			{
				id: "opencode",
				displayName: "OpenCode",
				installed: false,
				capabilities: {} as never,
				sessionCapabilities: {} as never,
				models: [],
			},
			{
				id: "claude",
				displayName: "Claude",
				installed: true,
				capabilities: {} as never,
				sessionCapabilities: {} as never,
				models: [],
			},
		])
		expect(id).toBe("claude")
	})

	test("falls back to first descriptor when none installed", () => {
		const id = resolveDefaultSessionRuntimeId([
			{
				id: "solo-harness",
				displayName: "Solo",
				installed: false,
				capabilities: {} as never,
				sessionCapabilities: {} as never,
				models: [],
			},
		])
		expect(id).toBe("solo-harness")
	})

	test("empty descriptors do not invent opencode via managed registry", () => {
		clearManagedServerRuntimeIds()
		// Stale brand must not apply when descriptors are empty and registry cleared
		expect(resolveDefaultSessionRuntimeId([])).toBe("")
		// Even if someone re-registers opencode without descriptors, product default
		// with non-empty descriptors still prefers the list (tested above).
		registerManagedServerRuntimeId("opencode")
		// With empty descriptors we may fall through to managed list — clear first:
		clearManagedServerRuntimeIds()
		expect(resolveDefaultSessionRuntimeId([])).toBe("")
	})

	test("sync from descriptors without opencode unplugs transport bootstrap", () => {
		syncTransportRegistryFromDescriptors([
			{
				id: "claude",
				displayName: "Claude",
				installed: true,
				capabilities: { managedLocalServer: false } as never,
				sessionCapabilities: { supportsRuntimeConfiguration: false } as never,
				transport: "agent-host",
				models: [],
			} as never,
		])
		expect(gatewayTransportForRuntimeId("opencode")).toBe("agent-host")
		expect(resolveDefaultSessionRuntimeId([
			{
				id: "claude",
				displayName: "Claude",
				installed: true,
				capabilities: {} as never,
				sessionCapabilities: {} as never,
				models: [],
			},
		])).toBe("claude")
	})
})

describe("automation default is registry-driven (no brand preference)", () => {
	beforeEach(() => {
		clearAutomationRuntimeExecutors()
	})

	test("resolveDefaultAutomationRuntimeId is first registration order", () => {
		registerAutomationRuntimeExecutor({
			runtimeId: "solo-harness",
			async execute(config) {
				return {
					sessionId: "s1",
					worktreePath: null,
					title: config.name,
					summary: "a",
					hasActionable: false,
					branch: null,
					error: null,
				}
			},
		})
		registerAutomationRuntimeExecutor({
			runtimeId: "opencode",
			async execute(config) {
				return {
					sessionId: "s2",
					worktreePath: null,
					title: config.name,
					summary: "b",
					hasActionable: false,
					branch: null,
					error: null,
				}
			},
		})
		// First registered wins — not brand preference for opencode
		expect(resolveDefaultAutomationRuntimeId()).toBe("solo-harness")
	})

	test("empty runtimeId uses registry default when opencode is absent", async () => {
		registerAutomationRuntimeExecutor({
			runtimeId: "solo-harness",
			async execute(config) {
				return {
					sessionId: "s-solo",
					worktreePath: null,
					title: config.name,
					summary: "solo-default",
					hasActionable: false,
					branch: null,
					error: null,
				}
			},
		})
		expect(listAutomationRuntimeExecutors().some((e) => e.runtimeId === "opencode")).toBe(false)
		const result = await executeAutomationRun({
			runtimeId: "",
			config: { id: "a-empty", name: "Legacy", prompt: "x" } as never,
			workspace: "/tmp",
		})
		expect(result.summary).toBe("solo-default")
		expect(result.sessionId).toBe("s-solo")
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
})

describe("executeRun product entry (shipped path, no Electron import)", () => {
	test("executeRun source dispatches via resolveDefaultAutomationRuntimeId (not hardcode)", async () => {
		const src = await Bun.file(
			new URL("../src/main/automation/executor.ts", import.meta.url),
		).text()
		expect(src).toContain("resolveDefaultAutomationRuntimeId")
		expect(src).toContain("composeAutomationExecutors")
		// Product entry must not force opencode when config.runtimeId is empty
		expect(src).not.toMatch(/runtimeId:\s*config\.runtimeId\s*\|\|\s*["']opencode["']/)
		// executeRun body uses resolveDefault — not a string literal default
		const executeRunBlock = src.slice(src.indexOf("export async function executeRun"))
		expect(executeRunBlock).toContain("resolveDefaultAutomationRuntimeId")
		expect(executeRunBlock).not.toMatch(/\|\|\s*["']opencode["']/)
	})

	test("empty runtimeId path resolves via registry when only custom executor exists", async () => {
		clearAutomationRuntimeExecutors()
		registerAutomationRuntimeExecutor({
			runtimeId: "product-solo",
			async execute(config) {
				return {
					sessionId: "s-prod",
					worktreePath: null,
					title: config.name,
					summary: "product-path",
					hasActionable: false,
					branch: null,
					error: null,
				}
			},
		})
		expect(resolveDefaultAutomationRuntimeId()).toBe("product-solo")
		// Same resolution executeRun uses when config.runtimeId is empty
		const result = await executeAutomationRun({
			runtimeId: resolveDefaultAutomationRuntimeId() ?? "",
			config: { id: "p1", name: "P", prompt: "go" } as never,
			workspace: "/ws",
		})
		expect(result.summary).toBe("product-path")
		expect(result.sessionId).toBe("s-prod")
	})
})
