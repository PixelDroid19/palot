import { describe, expect, test } from "bun:test"
import {
	DEFAULT_MANAGED_SERVER_RUNTIME_CAPABILITIES,
	DEFAULT_PROCESS_RUNTIME_CAPABILITIES,
	resolveRuntimeTransport,
	type AgentRuntimeDescriptor,
	type RuntimeAdapter,
	type RuntimePromptPayload,
} from "../src/types"
import { CLAUDE_MODEL_FALLBACK } from "../src/providers/claude"
import { CODEX_MODEL_FALLBACK, isCodexQuotaOrAccountLimit } from "../src/providers/codex"
import { FakeProvider } from "./fake-provider"

describe("neutral runtime contract", () => {
	test("RuntimeAdapter alias is implemented by providers", () => {
		const adapter: RuntimeAdapter = new FakeProvider("test")
		expect(adapter.id).toBe("test")
		expect(adapter.capabilities.models).toBe(true)
		expect(adapter.capabilities.managedLocalServer).toBe(false)
	})

	test("process vs managed-server default capabilities differ on product-critical flags", () => {
		expect(DEFAULT_PROCESS_RUNTIME_CAPABILITIES.managedLocalServer).toBe(false)
		expect(DEFAULT_PROCESS_RUNTIME_CAPABILITIES.sandboxModes).toBe(true)
		expect(DEFAULT_MANAGED_SERVER_RUNTIME_CAPABILITIES.managedLocalServer).toBe(true)
		expect(DEFAULT_MANAGED_SERVER_RUNTIME_CAPABILITIES.agentsProfiles).toBe(true)
		expect(DEFAULT_MANAGED_SERVER_RUNTIME_CAPABILITIES.variants).toBe(true)
	})

	test("resolveRuntimeTransport prefers explicit transport then capabilities", () => {
		expect(
			resolveRuntimeTransport({ transport: "agent-host", capabilities: { managedLocalServer: true } }),
		).toBe("agent-host")
		expect(resolveRuntimeTransport({ capabilities: { managedLocalServer: true } })).toBe(
			"managed-server",
		)
		expect(
			resolveRuntimeTransport({
				sessionCapabilities: { supportsRuntimeConfiguration: true },
			} as Pick<AgentRuntimeDescriptor, "sessionCapabilities">),
		).toBe("managed-server")
		expect(resolveRuntimeTransport({ managedLocalServer: false })).toBe("agent-host")
	})

	test("neutral prompt payload shape is adapter-agnostic", () => {
		const payload: RuntimePromptPayload = {
			runtimeId: "claude",
			text: "hello",
			model: "sonnet",
			effort: "high",
			permissionMode: "read-only",
			cwd: "/tmp/proj",
		}
		expect(payload.runtimeId).toBe("claude")
		expect(payload.permissionMode).toBe("read-only")
	})
})

describe("Claude model fallback", () => {
	test("fallback catalog is non-empty with explicit labels", () => {
		expect(CLAUDE_MODEL_FALLBACK.length).toBeGreaterThan(0)
		for (const model of CLAUDE_MODEL_FALLBACK) {
			expect(model.slug.length).toBeGreaterThan(0)
			expect(model.label.length).toBeGreaterThan(0)
			expect(model.efforts.length).toBeGreaterThan(0)
		}
		expect(CLAUDE_MODEL_FALLBACK.some((m) => m.slug === "default")).toBe(true)
	})
})

describe("Codex quota / model listing", () => {
	test("quota messages are detected as account state", () => {
		expect(isCodexQuotaOrAccountLimit("quota exceeded")).toBe(true)
		expect(isCodexQuotaOrAccountLimit("Rate limit hit")).toBe(true)
		expect(isCodexQuotaOrAccountLimit("connection refused")).toBe(false)
	})

	test("fallback catalog is non-empty so UI never blanks models", () => {
		expect(CODEX_MODEL_FALLBACK.length).toBeGreaterThan(0)
		for (const model of CODEX_MODEL_FALLBACK) {
			expect(model.slug.length).toBeGreaterThan(0)
			expect(model.efforts.length).toBeGreaterThan(0)
		}
	})
})
