/**
 * Drives the shipped agent-host automation factory and pure helpers.
 * Mocks only the agents/service outer boundary — not the mapping/timeout logic.
 */
import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test"
import {
	REQUIRED_HOST_TOOLS,
	ensureHostToolPlaneComplete as pureHeal,
	listMissingHostTools,
} from "../src/main/agents/host-tool-plane"

const openCalls: unknown[] = []
const promptCalls: unknown[] = []
const permissionCalls: Array<{ sessionId: string; requestId: string; decision: string }> = []
const questionCalls: Array<{ sessionId: string; requestId: string }> = []
const interruptCalls: string[] = []
const closeCalls: string[] = []
const eventListeners: Array<(evt: unknown) => void> = []

let promptImpl: () => Promise<{ message: string }> = async () => ({ message: "ok\nActionable: yes" })

/**
 * Partial mock of agents/service for automation executor only.
 * Re-export heal plane helpers so other test files that share the process
 * still get the real hot-upgrade API (mock.module is process-wide in bun:test).
 */
mock.module("../src/main/agents/service", () => ({
	getAgentHost: () => ({
		events: {
			on: (_event: string, listener: (evt: unknown) => void) => {
				eventListeners.push(listener)
				return () => {
					const i = eventListeners.indexOf(listener)
					if (i >= 0) eventListeners.splice(i, 1)
				}
			},
		},
	}),
	openAgentSession: async (sessionId: string, runtimeId: string, opts: unknown) => {
		openCalls.push({ sessionId, runtimeId, opts })
		return { threadId: "t1" }
	},
	promptAgent: async (sessionId: string, opts: unknown) => {
		promptCalls.push({ sessionId, opts })
		return promptImpl()
	},
	interruptAgent: async (sessionId: string) => {
		interruptCalls.push(sessionId)
		return true
	},
	closeAgentSession: async (sessionId: string) => {
		closeCalls.push(sessionId)
	},
	respondAgentPermission: (sessionId: string, requestId: string, decision: string) => {
		permissionCalls.push({ sessionId, requestId, decision })
		return true
	},
	answerAgentQuestion: (sessionId: string, requestId: string, _answers: Record<string, string>) => {
		questionCalls.push({ sessionId, requestId })
		return true
	},
	// Real heal plane — not reimplemented; same module getAgentHost uses.
	REQUIRED_HOST_TOOLS,
	listMissingHostTools,
	ensureHostToolPlaneComplete: (host: Parameters<typeof pureHeal>[0]) =>
		pureHeal(host, () => {}),
	setAgentHostSingletonForTests: () => {},
	resetAgentHostOptionsForTests: () => {},
}))

afterAll(() => {
	// Release process-wide mock so later suites can load the real service.
	mock.restore()
})

// Do not mock runtime-executor — registration is a side-effect and other tests
// import the real registry. agents/service is the only outer boundary mocked.

const {
	createAgentHostAutomationExecutor,
	sandboxFromPreset,
	permissionDecisionForPreset,
	modelSlugFromExecutionModel,
	timeoutMsFromConfig,
	runPromptWithTimeout,
	actionableFromMessage,
	AGENT_HOST_AUTOMATION_DEFAULT_TIMEOUT_SEC,
} = await import("../src/main/automation/agent-host-executor")

function baseConfig(overrides?: {
	permissionPreset?: "default" | "allow-all" | "read-only"
	timeout?: number
	model?: string
	effort?: "low" | "medium" | "high"
}) {
	return {
		id: "auto-1",
		name: "Nightly",
		prompt: "review the repo",
		version: 1 as const,
		status: "active" as const,
		schedule: { rrule: "FREQ=DAILY", timezone: "UTC" },
		workspaces: ["/ws"],
		execution: {
			model: overrides?.model ?? "openai/o3",
			effort: overrides?.effort ?? ("medium" as const),
			timeout: overrides?.timeout ?? 600,
			retries: 0,
			retryDelay: 60,
			parallelWorkspaces: false,
			approvalPolicy: "never" as const,
			useWorktree: false,
			permissionPreset: overrides?.permissionPreset ?? ("default" as const),
		},
	}
}

describe("agent-host automation pure helpers (shipped)", () => {
	test("sandboxFromPreset maps presets for unattended process runs", () => {
		expect(sandboxFromPreset("allow-all")).toBe("danger-full-access")
		expect(sandboxFromPreset("read-only")).toBe("read-only")
		expect(sandboxFromPreset("default")).toBe("workspace-write")
		expect(sandboxFromPreset(undefined)).toBe("workspace-write")
	})

	test("permissionDecisionForPreset accepts tools except read-only", () => {
		expect(permissionDecisionForPreset("default")).toBe("accept")
		expect(permissionDecisionForPreset("allow-all")).toBe("accept")
		expect(permissionDecisionForPreset("read-only")).toBe("decline")
		expect(permissionDecisionForPreset(undefined)).toBe("accept")
	})

	test("modelSlugFromExecutionModel strips provider prefix", () => {
		expect(modelSlugFromExecutionModel("openai/o3")).toBe("o3")
		expect(modelSlugFromExecutionModel("sonnet")).toBe("sonnet")
		expect(modelSlugFromExecutionModel(undefined)).toBeUndefined()
	})

	test("timeoutMsFromConfig uses seconds and defaults", () => {
		expect(timeoutMsFromConfig(30)).toBe(30_000)
		expect(timeoutMsFromConfig(0)).toBe(AGENT_HOST_AUTOMATION_DEFAULT_TIMEOUT_SEC * 1000)
		expect(timeoutMsFromConfig(undefined)).toBe(AGENT_HOST_AUTOMATION_DEFAULT_TIMEOUT_SEC * 1000)
	})

	test("runPromptWithTimeout interrupts and rejects on timeout", async () => {
		const interrupted: string[] = []
		await expect(
			runPromptWithTimeout({
				sessionId: "s-timeout",
				timeoutMs: 20,
				prompt: () => new Promise(() => {}),
				interrupt: async (id) => {
					interrupted.push(id)
					return true
				},
			}),
		).rejects.toThrow(/timed out after 20ms/)
		expect(interrupted).toEqual(["s-timeout"])
	})

	test("runPromptWithTimeout resolves when prompt finishes first", async () => {
		const result = await runPromptWithTimeout({
			sessionId: "s-ok",
			timeoutMs: 5_000,
			prompt: async () => ({ message: "done" }),
			interrupt: async () => true,
		})
		expect(result.message).toBe("done")
	})

	test("actionableFromMessage parses trailer", () => {
		expect(actionableFromMessage("hello\nActionable: yes")).toBe(true)
		expect(actionableFromMessage("hello\nActionable: no")).toBe(false)
	})
})

describe("createAgentHostAutomationExecutor (real factory, mocked agents/service)", () => {
	beforeEach(() => {
		openCalls.length = 0
		promptCalls.length = 0
		permissionCalls.length = 0
		questionCalls.length = 0
		interruptCalls.length = 0
		closeCalls.length = 0
		eventListeners.length = 0
		promptImpl = async () => ({ message: "reviewed\nActionable: yes" })
	})

	test("registers codex and claude runtimeIds on the executor object", () => {
		expect(createAgentHostAutomationExecutor("codex").runtimeId).toBe("codex")
		expect(createAgentHostAutomationExecutor("claude").runtimeId).toBe("claude")
	})

	test("default preset opens workspace-write and accepts tool permissions", async () => {
		promptImpl = async () => {
			// Fire host events while the turn is in flight (listener still subscribed).
			const sessionId = (openCalls[0] as { sessionId: string }).sessionId
			for (const listener of eventListeners) {
				listener({
					sessionId,
					runtimeId: "codex",
					update: {
						kind: "permission",
						request: {
							requestId: "p1",
							action: "command",
							name: "bash",
							decisions: ["accept", "decline"],
						},
					},
				})
				listener({
					sessionId,
					runtimeId: "codex",
					update: {
						kind: "question",
						request: { requestId: "q1", questions: [] },
					},
				})
			}
			return { message: "reviewed\nActionable: yes" }
		}

		const executor = createAgentHostAutomationExecutor("codex")
		const result = await executor.execute(baseConfig({ permissionPreset: "default" }), "/ws")

		expect(result.error).toBeNull()
		expect(result.hasActionable).toBe(true)
		expect(openCalls[0]).toMatchObject({
			runtimeId: "codex",
			opts: {
				cwd: "/ws",
				sandbox: "workspace-write",
				model: "o3",
				reasoningEffort: "medium",
			},
		})
		const sessionId = (openCalls[0] as { sessionId: string }).sessionId
		expect(permissionCalls).toEqual([{ sessionId, requestId: "p1", decision: "accept" }])
		expect(questionCalls).toEqual([{ sessionId, requestId: "q1" }])
		expect(closeCalls.length).toBe(1)
	})

	test("read-only preset declines tool permissions", async () => {
		promptImpl = async () => {
			const sessionId = (openCalls[0] as { sessionId: string }).sessionId
			for (const listener of eventListeners) {
				listener({
					sessionId,
					runtimeId: "claude",
					update: {
						kind: "permission",
						request: {
							requestId: "p2",
							action: "edit",
							name: "Write",
							decisions: ["accept"],
						},
					},
				})
			}
			return { message: "ok\nActionable: no" }
		}

		const executor = createAgentHostAutomationExecutor("claude")
		await executor.execute(baseConfig({ permissionPreset: "read-only" }), "/ws")
		expect(openCalls[0]).toMatchObject({
			opts: { sandbox: "read-only" },
		})
		expect(permissionCalls[0]?.decision).toBe("decline")
	})

	test("allow-all uses danger-full-access sandbox", async () => {
		const executor = createAgentHostAutomationExecutor("codex")
		await executor.execute(baseConfig({ permissionPreset: "allow-all" }), "/proj")
		expect(openCalls[0]).toMatchObject({
			opts: { sandbox: "danger-full-access", cwd: "/proj" },
		})
	})

	test("honors execution.timeout via interrupt when prompt hangs", async () => {
		promptImpl = () => new Promise(() => {})
		const executor = createAgentHostAutomationExecutor("codex")
		const result = await executor.execute(baseConfig({ timeout: 0.05 }), "/ws")
		// 0.05s → 50ms timeout path
		expect(result.error).toMatch(/timed out/i)
		expect(interruptCalls.length).toBeGreaterThan(0)
		expect(closeCalls.length).toBe(1)
	})
})
