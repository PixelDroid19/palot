import { describe, expect, test } from "bun:test"
import { AgentHost } from "../src/host"
import { CLAUDE_MODEL_FALLBACK } from "../src/providers/claude"
import { CODEX_MODEL_FALLBACK } from "../src/providers/codex"
import type {
	AgentModelInfo,
	AgentSession,
	AgentSessionOptions,
	AgentSessionProvider,
	AgentUpdate,
	AgentRunResult,
} from "../src/types"
import { DEFAULT_PROCESS_RUNTIME_CAPABILITIES } from "../src/types"

class ThrowingListModelsProvider implements AgentSessionProvider {
	readonly id = "codex"
	readonly displayName = "Throwing Codex"
	readonly binary = "codex-does-not-exist-xyz"
	readonly fallbackModels = CODEX_MODEL_FALLBACK
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
		throw new Error("discovery blew up")
	}

	async openSession(
		_opts: AgentSessionOptions,
		_onUpdate: (update: AgentUpdate) => void,
	): Promise<AgentSession> {
		throw new Error("not used")
	}

	async dispose(): Promise<void> {}
}

class EmptyListModelsProvider implements AgentSessionProvider {
	readonly id = "claude"
	readonly displayName = "Empty Claude"
	readonly binary = "claude-does-not-exist-xyz"
	readonly fallbackModels = CLAUDE_MODEL_FALLBACK
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

describe("AgentHost.describeRuntimes catalog hardening", () => {
	test("listModels throw still yields non-empty codex FALLBACK catalog", async () => {
		const host = new AgentHost({ builtinProviders: false })
		host.registerProvider(new ThrowingListModelsProvider())
		const runtimes = await host.describeRuntimes()
		const codex = runtimes.find((r) => r.id === "codex")
		expect(codex).toBeDefined()
		expect(codex!.models.length).toBeGreaterThan(0)
		expect(codex!.models.map((m) => m.slug)).toEqual(CODEX_MODEL_FALLBACK.map((m) => m.slug))
	})

	test("empty listModels still yields non-empty claude FALLBACK when models capability is true", async () => {
		const host = new AgentHost({ builtinProviders: false })
		host.registerProvider(new EmptyListModelsProvider())
		const runtimes = await host.describeRuntimes()
		const claude = runtimes.find((r) => r.id === "claude")
		expect(claude).toBeDefined()
		expect(claude!.models.length).toBeGreaterThan(0)
		expect(claude!.models[0]!.slug).toBe(CLAUDE_MODEL_FALLBACK[0]!.slug)
	})
})

// silence unused type import if tree-shaken oddly
void (null as unknown as AgentRunResult)
