import { describe, expect, test } from "bun:test"
import { ClaudeProvider } from "../src/providers/claude"
import { CodexProvider } from "../src/providers/codex"
import { resolveRuntimeTransport } from "../src/types"

describe("adapter capabilities declare UI-driving flags", () => {
	test("Claude process adapter", () => {
		const claude = new ClaudeProvider(async () => null)
		expect(claude.capabilities.models).toBe(true)
		expect(claude.capabilities.sandboxModes).toBe(true)
		expect(claude.capabilities.reasoningEffort).toBe(true)
		expect(claude.capabilities.managedLocalServer).toBe(false)
		expect(claude.capabilities.agentsProfiles).toBe(false)
		expect(claude.sessionCapabilities.supportsRuntimeConfiguration).toBe(false)
		expect(resolveRuntimeTransport({ capabilities: claude.capabilities })).toBe("agent-host")
	})

	test("Codex process adapter", () => {
		const codex = new CodexProvider(async () => null)
		expect(codex.capabilities.models).toBe(true)
		expect(codex.capabilities.sandboxModes).toBe(true)
		expect(codex.capabilities.reasoningEffort).toBe(true)
		expect(codex.capabilities.managedLocalServer).toBe(false)
		expect(resolveRuntimeTransport({ capabilities: codex.capabilities })).toBe("agent-host")
	})

	test("Claude listModels returns non-empty fallback without binary", async () => {
		const claude = new ClaudeProvider(async () => null)
		const models = await claude.listModels()
		expect(models.length).toBeGreaterThan(0)
		expect(models[0]?.slug).toBeTruthy()
		expect(models[0]?.label).toBeTruthy()
	})

	test("Claude listBackgroundAgents returns [] without binary", async () => {
		const claude = new ClaudeProvider(async () => null)
		const agents = await claude.listBackgroundAgents()
		expect(agents).toEqual([])
	})
})
