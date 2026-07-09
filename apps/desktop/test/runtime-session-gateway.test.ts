/**
 * Gateway dispatch tests: call the real runtimeSessionGateway create/prompt/
 * switch entry points. Mocks only outer process/SDK boundaries — never re-implement
 * transport selection or the GATEWAY_BY_TRANSPORT table.
 */
import { beforeEach, describe, expect, mock, test } from "bun:test"
import {
	gatewayTransportForRuntimeId,
	resolveRuntimeTransport,
} from "../src/renderer/lib/runtime-transport"
import { PROJECT_RUNTIME_ID } from "../src/shared/runtime-ids"

// --- Outer boundary mocks (must be registered before gateway import) ---

const createAgentHostCalls: unknown[] = []
const runTurnCalls: unknown[] = []
const switchToManagedCalls: unknown[] = []
const switchAgentHostCalls: unknown[] = []
const managedCreateCalls: unknown[] = []
const managedPromptCalls: unknown[] = []

mock.module("../src/renderer/services/runtime-cli-session", () => ({
	createCliRuntimeSessionState: (args: unknown) => {
		createAgentHostCalls.push(args)
		return `agent-host-session-${createAgentHostCalls.length}`
	},
	switchCliRuntimeSession: async (sessionId: string, runtimeId: string) => {
		switchAgentHostCalls.push({ sessionId, runtimeId })
	},
	switchSessionIntoManagedServer: async (sessionId: string, _create: unknown) => {
		switchToManagedCalls.push(sessionId)
		return "managed-after-switch"
	},
	switchCliSessionIntoProjectRuntime: async (sessionId: string, _create: unknown) => {
		switchToManagedCalls.push(sessionId)
		return "managed-after-switch"
	},
}))

mock.module("../src/renderer/services/runtime-cli-turns", () => ({
	runCliRuntimeTurn: async (sessionId: string, text: string, options?: unknown) => {
		runTurnCalls.push({ sessionId, text, options })
	},
	interruptCliRuntimeTurn: () => {},
	consumeRuntimeHandoff: () => null,
	consumeCliToProjectRuntimeHandoff: () => null,
	consumeCliToManagedRuntimeHandoff: () => null,
}))

mock.module("../src/renderer/services/runtime-cli-store", () => ({
	forgetCliRuntimeSession: async () => {},
	persistCliRuntimeSession: () => {},
}))

mock.module("../src/renderer/services/runtime-client", () => ({
	requireRuntimeSessionClient: () => ({
		session: {
			create: async (args: { title?: string }) => {
				managedCreateCalls.push(args)
				return { data: { id: "managed-session-1", title: args.title ?? "t" } }
			},
			promptAsync: async (args: unknown) => {
				managedPromptCalls.push(args)
			},
			abort: async () => {},
			update: async () => {},
			delete: async () => {},
			revert: async () => {},
			unrevert: async () => {},
			command: async () => {},
			summarize: async () => {},
			fork: async () => ({ data: { id: "forked" } }),
			get: async () => ({ data: {} }),
		},
		part: { delete: async () => {} },
	}),
}))

mock.module("../src/renderer/atoms/messages", () => ({
	upsertMessageAtom: Symbol("upsertMessage"),
}))
mock.module("../src/renderer/atoms/parts", () => ({
	upsertPartAtom: Symbol("upsertPart"),
}))
mock.module("../src/renderer/atoms/sessions", () => ({
	removeSessionAtom: Symbol("removeSession"),
	sessionFamily: () => Symbol("sessionFamily"),
	upsertSessionAtom: Symbol("upsertSession"),
}))
mock.module("../src/renderer/atoms/store", () => ({
	appStore: {
		get: () => null,
		set: () => {},
	},
}))

// Session runtime state: agent-host sessions for codex/claude, managed for opencode.
const sessionRuntimeById: Record<string, string> = {}
mock.module("../src/renderer/lib/runtime-session-config", () => ({
	readSessionRuntimeState: (sessionId: string) => ({
		sessionId,
		directory: "/ws",
		runtimeId: sessionRuntimeById[sessionId] ?? "opencode",
		meta:
			sessionRuntimeById[sessionId] && sessionRuntimeById[sessionId] !== "opencode"
				? {
						runtimeId: sessionRuntimeById[sessionId],
						cwd: "/ws",
						sandbox: "read-only",
						threadId: null,
					}
				: null,
		modelPreference: null,
	}),
	resolveConfiguredPromptOptions: (
		_state: unknown,
		options?: unknown,
	) => options ?? {},
	resolvePromptRuntime: (
		state: { runtimeId?: string } | null,
		options?: { runtimeId?: string },
	) => options?.runtimeId ?? state?.runtimeId ?? "opencode",
	isCliRuntimeState: (state: { runtimeId: string }) => state.runtimeId !== "opencode",
	sessionUsesAgentHostTransport: (state: { runtimeId: string }) =>
		state.runtimeId !== "opencode",
	cliRuntimeMeta: (state: { meta: unknown }) => state.meta,
	patchSessionRuntimeState: () => {},
}))

const { runtimeSessionGateway } = await import(
	"../src/renderer/services/runtime-session-gateway"
)

describe("runtimeSessionGateway pure transport map", () => {
	test("OpenCode / Codex / Claude transport keys", () => {
		expect(gatewayTransportForRuntimeId(PROJECT_RUNTIME_ID)).toBe("managed-server")
		expect(gatewayTransportForRuntimeId("codex")).toBe("agent-host")
		expect(gatewayTransportForRuntimeId("claude")).toBe("agent-host")
		expect(
			resolveRuntimeTransport({ supportsRuntimeConfiguration: true }),
		).toBe("managed-server")
	})
})

describe("runtimeSessionGateway.createSession (real entry, outer mocks)", () => {
	beforeEach(() => {
		createAgentHostCalls.length = 0
		managedCreateCalls.length = 0
	})

	test("opencode → managed-server createSession", async () => {
		const result = await runtimeSessionGateway.createSession({
			directory: "/proj",
			runtimeId: "opencode",
			title: "hello",
		})
		expect(result).not.toBeNull()
		expect(result?.sessionId).toBe("managed-session-1")
		expect(result?.runtimeId).toBe("opencode")
		expect(managedCreateCalls.length).toBe(1)
		expect(createAgentHostCalls.length).toBe(0)
	})

	test("codex → agent-host createSession with sandbox/model/effort", async () => {
		const result = await runtimeSessionGateway.createSession({
			directory: "/proj",
			runtimeId: "codex",
			sandbox: "workspace-write",
			model: "o3",
			effort: "high",
		})
		expect(result?.sessionId).toBe("agent-host-session-1")
		expect(result?.runtimeId).toBe("codex")
		expect(createAgentHostCalls[0]).toMatchObject({
			directory: "/proj",
			runtimeId: "codex",
			sandbox: "workspace-write",
			model: "o3",
			effort: "high",
		})
		expect(managedCreateCalls.length).toBe(0)
	})

	test("claude → agent-host createSession", async () => {
		const result = await runtimeSessionGateway.createSession({
			directory: "/proj",
			runtimeId: "claude",
			sandbox: "plan",
			model: "sonnet",
			effort: "medium",
		})
		expect(result?.runtimeId).toBe("claude")
		expect(createAgentHostCalls[0]).toMatchObject({
			runtimeId: "claude",
			model: "sonnet",
			effort: "medium",
			sandbox: "plan",
		})
	})
})

describe("runtimeSessionGateway.promptSession / promptNeutral", () => {
	beforeEach(() => {
		runTurnCalls.length = 0
		managedPromptCalls.length = 0
		Object.keys(sessionRuntimeById).forEach((k) => {
			delete sessionRuntimeById[k]
		})
	})

	test("codex prompt applies neutral effort/permissionMode/modelSlug/cwd", async () => {
		sessionRuntimeById["s-codex"] = "codex"
		await runtimeSessionGateway.promptSession("/ws", "s-codex", "fix it", {
			runtimeId: "codex",
			modelSlug: "o3",
			effort: "high",
			permissionMode: "workspace-write",
			cwd: "/ws",
		})
		expect(runTurnCalls.length).toBe(1)
		expect(runTurnCalls[0]).toMatchObject({
			sessionId: "s-codex",
			text: "fix it",
			options: {
				modelSlug: "o3",
				effort: "high",
				permissionMode: "workspace-write",
				cwd: "/ws",
			},
		})
		expect(managedPromptCalls.length).toBe(0)
	})

	test("promptNeutral maps full payload for claude", async () => {
		sessionRuntimeById["s-claude"] = "claude"
		await runtimeSessionGateway.promptNeutral("/ws", "s-claude", {
			runtimeId: "claude",
			text: "hello",
			model: "sonnet",
			effort: "xhigh",
			permissionMode: "read-only",
			profile: "build",
			cwd: "/ws/src",
		})
		expect(runTurnCalls[0]).toMatchObject({
			sessionId: "s-claude",
			text: "hello",
			options: {
				modelSlug: "sonnet",
				effort: "xhigh",
				permissionMode: "read-only",
				cwd: "/ws/src",
			},
		})
	})

	test("opencode prompt goes to managed-server promptAsync", async () => {
		sessionRuntimeById["s-oc"] = "opencode"
		await runtimeSessionGateway.promptSession("/ws", "s-oc", "build feature", {
			runtimeId: "opencode",
			model: { providerID: "anthropic", modelID: "claude" },
			agentName: "build",
			variant: "high",
		})
		expect(managedPromptCalls.length).toBe(1)
		expect(managedPromptCalls[0]).toMatchObject({
			sessionID: "s-oc",
			agent: "build",
			variant: "high",
			model: { providerID: "anthropic", modelID: "claude" },
		})
		expect(runTurnCalls.length).toBe(0)
	})
})

describe("runtimeSessionGateway.switchRuntimeSession", () => {
	beforeEach(() => {
		switchToManagedCalls.length = 0
		switchAgentHostCalls.length = 0
		Object.keys(sessionRuntimeById).forEach((k) => {
			delete sessionRuntimeById[k]
		})
	})

	test("agent-host → managed-server uses handoff path", async () => {
		sessionRuntimeById["s1"] = "codex"
		const next = await runtimeSessionGateway.switchRuntimeSession("s1", "opencode", "/ws")
		expect(next).toBe("managed-after-switch")
		expect(switchToManagedCalls).toEqual(["s1"])
	})

	test("any → codex uses agent-host switch", async () => {
		sessionRuntimeById["s1"] = "opencode"
		const next = await runtimeSessionGateway.switchRuntimeSession("s1", "codex", "/ws")
		expect(next).toBe("s1")
		expect(switchAgentHostCalls[0]).toMatchObject({
			sessionId: "s1",
			runtimeId: "codex",
		})
	})

	test("any → claude uses agent-host switch", async () => {
		const next = await runtimeSessionGateway.switchRuntimeSession("s2", "claude")
		expect(next).toBe("s2")
		expect(switchAgentHostCalls[0]).toMatchObject({ runtimeId: "claude" })
	})
})
