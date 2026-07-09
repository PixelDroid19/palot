import { describe, expect, test } from "bun:test"
import {
	buildToolbarSectionsFromSlots,
	type RuntimeToolbarSections,
} from "../src/renderer/components/chat/runtime-toolbar-sections"
import {
	gatewayTransportForRuntimeId,
	resolveRuntimeTransport,
} from "../src/renderer/lib/runtime-transport"
import {
	registerManagedServerRuntimeId,
	syncManagedServerRuntimeIds,
} from "../src/shared/runtime-transport-registry"
import { OPENCODE_RUNTIME_ID, PROJECT_RUNTIME_ID } from "../src/shared/runtime-ids"
import { syncTransportRegistryFromDescriptors } from "../src/renderer/lib/session-runtimes"

describe("runtime transport neutrality", () => {
	test("OpenCode id is managed-server only when registered/synced (not module-load freeze)", () => {
		expect(PROJECT_RUNTIME_ID).toBe("opencode")
		expect(OPENCODE_RUNTIME_ID).toBe("opencode")
		// Sync as if main included OpenCode in descriptors
		syncManagedServerRuntimeIds([PROJECT_RUNTIME_ID])
		expect(gatewayTransportForRuntimeId(PROJECT_RUNTIME_ID)).toBe("managed-server")
		// Unplug: empty sync
		syncManagedServerRuntimeIds([])
		expect(gatewayTransportForRuntimeId(PROJECT_RUNTIME_ID)).toBe("agent-host")
	})

	test("process adapters (codex/claude) use agent-host transport", () => {
		expect(gatewayTransportForRuntimeId("codex")).toBe("agent-host")
		expect(gatewayTransportForRuntimeId("claude")).toBe("agent-host")
	})

	test("syncTransportRegistryFromDescriptors only registers managed-server transports", () => {
		syncTransportRegistryFromDescriptors([
			{
				id: "opencode",
				displayName: "OpenCode",
				installed: true,
				capabilities: { managedLocalServer: true } as never,
				sessionCapabilities: { supportsRuntimeConfiguration: true } as never,
				transport: "managed-server",
				models: [],
				setup: { description: "", version: null, compatible: true, warning: null },
			} as never,
			{
				id: "claude",
				displayName: "Claude",
				installed: true,
				capabilities: { managedLocalServer: false } as never,
				sessionCapabilities: { supportsRuntimeConfiguration: false } as never,
				transport: "agent-host",
				models: [],
				setup: { description: "", version: null, compatible: true, warning: null },
			} as never,
		])
		expect(gatewayTransportForRuntimeId("opencode")).toBe("managed-server")
		expect(gatewayTransportForRuntimeId("claude")).toBe("agent-host")
		// Main unplugged OpenCode from describe list
		syncTransportRegistryFromDescriptors([
			{
				id: "claude",
				displayName: "Claude",
				installed: true,
				capabilities: { managedLocalServer: false } as never,
				sessionCapabilities: { supportsRuntimeConfiguration: false } as never,
				transport: "agent-host",
				models: [],
				setup: { description: "", version: null, compatible: true, warning: null },
			} as never,
		])
		expect(gatewayTransportForRuntimeId("opencode")).toBe("agent-host")
		void registerManagedServerRuntimeId
	})

	test("resolveRuntimeTransport is capability-driven", () => {
		expect(
			resolveRuntimeTransport({
				capabilities: { managedLocalServer: true },
				sessionCapabilities: {
					supportsSessionRevert: true,
					supportsSessionSummarize: true,
					supportsServerSlashCommands: true,
					supportsFork: true,
					supportsRuntimeConfiguration: true,
					supportsWorktreeLaunch: true,
					supportsServerHistory: true,
				},
			}),
		).toBe("managed-server")
		expect(
			resolveRuntimeTransport({
				capabilities: { managedLocalServer: false },
				sessionCapabilities: {
					supportsSessionRevert: false,
					supportsSessionSummarize: false,
					supportsServerSlashCommands: false,
					supportsFork: false,
					supportsRuntimeConfiguration: false,
					supportsWorktreeLaunch: false,
					supportsServerHistory: false,
				},
			}),
		).toBe("agent-host")
	})
})

describe("unified toolbar grammar", () => {
	test("same slot builder omits empty effort/variant and keeps sandbox", () => {
		const sections: RuntimeToolbarSections = {
			model: {
				items: [{ value: "m1", label: "Model 1", group: "Models" }],
				value: "m1",
				onValueChange: () => {},
			},
			sandbox: {
				value: "read-only",
				onValueChange: () => {},
			},
			effort: {
				efforts: [],
				value: "",
				onValueChange: () => {},
			},
			variant: {
				variants: [],
				selectedVariant: undefined,
				onSelectVariant: () => {},
			},
		}
		const built = buildToolbarSectionsFromSlots(sections)
		expect(built.model).toBeDefined()
		expect(built.sandbox).toBeDefined()
		expect(built.effort).toBeUndefined()
		expect(built.variant).toBeUndefined()
		expect(built.agent).toBeUndefined()
	})

	test("agent + model + variant slots for managed-server-style config", () => {
		const sections: RuntimeToolbarSections = {
			agent: {
				agents: [{ name: "build" }],
				selectedAgent: "build",
				onSelectAgent: () => {},
			},
			model: {
				items: [{ value: "anthropic/claude", label: "Claude", group: "Anthropic" }],
				value: "anthropic/claude",
				onValueChange: () => {},
			},
			variant: {
				variants: ["high", "max"],
				selectedVariant: "high",
				onSelectVariant: () => {},
			},
		}
		const built = buildToolbarSectionsFromSlots(sections)
		expect(built.agent).toBeDefined()
		expect(built.model).toBeDefined()
		expect(built.variant).toBeDefined()
		expect(built.sandbox).toBeUndefined()
	})

	test("process-runtime slots: model + sandbox + effort (no agent)", () => {
		const sections: RuntimeToolbarSections = {
			model: {
				items: [
					{ value: "sonnet", label: "Sonnet", group: "Models" },
					{ value: "opus", label: "Opus", group: "Models" },
				],
				value: "sonnet",
				onValueChange: () => {},
			},
			sandbox: {
				value: "workspace-write",
				onValueChange: () => {},
			},
			effort: {
				efforts: ["low", "medium", "high"],
				value: "high",
				onValueChange: () => {},
			},
		}
		const built = buildToolbarSectionsFromSlots(sections)
		expect(Object.keys(built).filter((k) => built[k as keyof typeof built])).toEqual([
			"model",
			"sandbox",
			"effort",
		])
	})
})
