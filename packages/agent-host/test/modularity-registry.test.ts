/**
 * Proves registry-only composition: custom harness without built-ins,
 * selective built-ins, unregister, adapter-owned model fallbacks.
 */
import { describe, expect, test } from "bun:test"
import { AgentHost } from "../src/host"
import { createBuiltInProviders } from "../src/builtins"
import type {
	AgentModelInfo,
	AgentSession,
	AgentSessionOptions,
	AgentSessionProvider,
	AgentUpdate,
} from "../src/types"
import { DEFAULT_PROCESS_RUNTIME_CAPABILITIES } from "../src/types"

const FALLBACK: AgentModelInfo[] = [
	{ slug: "custom-default", label: "Custom Default", efforts: ["low", "high"] },
]

class CustomHarnessProvider implements AgentSessionProvider {
	readonly id = "custom-harness"
	readonly displayName = "Custom Harness"
	readonly binary = "custom-harness-bin-xyz"
	readonly fallbackModels = FALLBACK
	readonly capabilities = { ...DEFAULT_PROCESS_RUNTIME_CAPABILITIES }
	readonly sessionCapabilities = {
		supportsSessionRevert: false,
		supportsSessionSummarize: false,
		supportsServerSlashCommands: false,
		supportsFork: false,
		supportsRuntimeConfiguration: false,
		supportsWorktreeLaunch: false,
		supportsServerHistory: false,
	}

	async listModels(): Promise<AgentModelInfo[]> {
		return []
	}

	async openSession(
		_opts: AgentSessionOptions,
		_onUpdate: (update: AgentUpdate) => void,
	): Promise<AgentSession> {
		throw new Error("not used")
	}

	async dispose(): Promise<void> {}
}

describe("AgentHost modular composition", () => {
	test("custom-only host: no codex/claude when builtinProviders is false", async () => {
		const host = new AgentHost({
			builtinProviders: false,
			providers: [new CustomHarnessProvider()],
		})
		const ids = host.listRuntimes().map((r) => r.id)
		expect(ids).toEqual(["custom-harness"])
		expect(host.hasProvider("codex")).toBe(false)
		expect(host.hasProvider("claude")).toBe(false)

		const desc = await host.describeRuntimes()
		expect(desc).toHaveLength(1)
		expect(desc[0]!.id).toBe("custom-harness")
		// empty listModels → adapter-owned fallbackModels
		expect(desc[0]!.models.map((m) => m.slug)).toEqual(["custom-default"])
	})

	test("selective built-ins: only claude without codex", () => {
		const host = new AgentHost({ builtinProviders: ["claude"] })
		expect(host.hasProvider("claude")).toBe(true)
		expect(host.hasProvider("codex")).toBe(false)
	})

	test("unregisterProvider unplugs an adapter", () => {
		const host = new AgentHost({ builtinProviders: ["codex", "claude"] })
		expect(host.unregisterProvider("codex")).toBe(true)
		expect(host.hasProvider("codex")).toBe(false)
		expect(host.hasProvider("claude")).toBe(true)
		expect(host.unregisterProvider("codex")).toBe(false)
	})

	test("createBuiltInProviders subset is independent of host defaults", () => {
		const onlyCodex = createBuiltInProviders(async () => null, ["codex"])
		expect(onlyCodex.map((p) => p.id)).toEqual(["codex"])
		expect(onlyCodex[0]!.fallbackModels?.length).toBeGreaterThan(0)
	})

	test("openSession fails closed for unregistered runtimeId", async () => {
		const host = new AgentHost({
			builtinProviders: false,
			providers: [new CustomHarnessProvider()],
		})
		await expect(host.openSession("s1", "codex", { cwd: "/tmp" })).rejects.toThrow(
			/Unknown agent runtime: codex/,
		)
	})
})
