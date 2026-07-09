/**
 * Integration: getAgentHost() hot-upgrade path heals incomplete singleton.
 * Mocks only Electron shell/app (cannot load in bun:test); drives real
 * getAgentHost + setAgentHostSingletonForTests from agents/service.
 */
import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test"

mock.module("electron", () => ({
	app: {
		getPath: (name: string) => `/tmp/palot-test-${name}`,
	},
	shell: {
		openExternal: async () => {},
	},
}))

mock.module("@palot/cli-registry", () => ({
	whichOnPath: async () => null,
}))

// agent-clis / compatibility only used by describeSessionRuntimes; keep light stubs
mock.module("../src/main/agent-clis", () => ({
	detectAgentClis: async () => [],
}))
mock.module("../src/main/compatibility", () => ({
	checkProjectRuntime: async () => ({
		installed: false,
		compatible: false,
		path: null,
		version: null,
		message: "test",
	}),
}))

// host-tool-backends pulls electron shell — stub to pure platform tools
mock.module("../src/main/agents/host-tool-backends", () => {
	const { registerDefaultPlatformTools } = require("@palot/agent-host")
	return {
		installDesktopHostToolBackends: (host: { tools: unknown }) => {
			registerDefaultPlatformTools(host.tools as never)
		},
	}
})

const { AgentHost } = await import("@palot/agent-host")
const {
	REQUIRED_HOST_TOOLS,
	getAgentHost,
	setAgentHostSingletonForTests,
	resetAgentHostOptionsForTests,
	ensureHostToolPlaneComplete,
} = await import("../src/main/agents/service")

afterEach(() => {
	setAgentHostSingletonForTests(null)
	resetAgentHostOptionsForTests()
})

describe("getAgentHost hot-upgrade heal entry", () => {
	test("getAgentHost reinstalls missing subagents on existing singleton", async () => {
		const incomplete = new AgentHost({
			builtinProviders: false,
			resolveBinary: async () => null,
		})
		incomplete.tools.unregister("palot_list_subagents")
		incomplete.tools.unregister("palot_run_subagent")
		expect(incomplete.tools.has("palot_list_subagents")).toBe(false)

		// Plant long-lived singleton (old main process)
		setAgentHostSingletonForTests(incomplete)

		// Real product entry point used by every IPC/session call
		const host = getAgentHost()
		expect(host).toBe(incomplete)
		expect(host.tools.has("palot_list_subagents")).toBe(true)
		expect(host.tools.has("palot_run_subagent")).toBe(true)

		const roles = JSON.parse(await host.tools.call("palot_list_subagents")) as { id: string }[]
		expect(roles.map((r) => r.id).sort()).toEqual(["explore", "general-purpose"])
	})

	test("ensureHostToolPlaneComplete is the same heal getAgentHost uses", () => {
		const host = new AgentHost({
			builtinProviders: false,
			resolveBinary: async () => null,
			registerHostTools: false,
		})
		const missing = ensureHostToolPlaneComplete(host)
		expect(missing.length).toBeGreaterThan(0)
		for (const name of REQUIRED_HOST_TOOLS) {
			expect(host.tools.has(name)).toBe(true)
		}
	})
})
