/**
 * Hot-upgrade heal for the host tool plane.
 *
 * Drives the shipped heal module used by getAgentHost() when a long-lived
 * Electron main process still holds a pre-subagent AgentHost singleton
 * (live QA: bridge returned "Unknown host tool: palot_list_subagents").
 */
import { describe, expect, test } from "bun:test"
import { AgentHost, registerDefaultPlatformTools } from "@palot/agent-host"
import {
	REQUIRED_HOST_TOOLS,
	ensureHostToolPlaneComplete,
	listMissingHostTools,
} from "../src/main/agents/host-tool-plane"

/** Backend installer without Electron (same call shape as desktop backends). */
function installStubPlatformBackends(host: AgentHost): void {
	registerDefaultPlatformTools(host.tools)
}

describe("host-tool-plane heal (shipped getAgentHost path)", () => {
	test("listMissingHostTools reports only absent required names", () => {
		const host = new AgentHost({
			builtinProviders: false,
			resolveBinary: async () => null,
			registerHostTools: false,
		})
		expect(listMissingHostTools(host)).toEqual([...REQUIRED_HOST_TOOLS])
	})

	test("no-op when plane is complete", () => {
		const host = new AgentHost({
			builtinProviders: false,
			resolveBinary: async () => null,
		})
		const missing = ensureHostToolPlaneComplete(host, installStubPlatformBackends)
		expect(missing).toEqual([])
		for (const name of REQUIRED_HOST_TOOLS) {
			expect(host.tools.has(name)).toBe(true)
		}
	})

	test("heals stripped subagent tools — live QA regression path", async () => {
		const host = new AgentHost({
			builtinProviders: false,
			resolveBinary: async () => null,
		})
		// Pre-subagent singleton: plane without list/run subagents
		host.tools.unregister("palot_list_subagents")
		host.tools.unregister("palot_run_subagent")
		expect(listMissingHostTools(host)).toEqual([
			"palot_list_subagents",
			"palot_run_subagent",
		])

		// Same function getAgentHost() calls on existing singleton
		const healed = ensureHostToolPlaneComplete(host, installStubPlatformBackends)
		expect(healed).toEqual(["palot_list_subagents", "palot_run_subagent"])
		expect(listMissingHostTools(host)).toEqual([])

		const listed = JSON.parse(await host.tools.call("palot_list_subagents")) as {
			id: string
		}[]
		expect(listed.map((r) => r.id).sort()).toEqual(["explore", "general-purpose"])
	})

	test("heals empty host built with registerHostTools: false", async () => {
		// getAgentHost hot path: singleton already exists but has zero tools
		const host = new AgentHost({
			builtinProviders: false,
			resolveBinary: async () => null,
			registerHostTools: false,
		})
		expect(host.tools.list()).toEqual([])

		ensureHostToolPlaneComplete(host, installStubPlatformBackends)

		for (const name of REQUIRED_HOST_TOOLS) {
			expect(host.tools.has(name)).toBe(true)
		}
		// Bridge-equivalent call after heal
		const agents = JSON.parse(await host.tools.call("palot_list_agents")) as unknown[]
		expect(Array.isArray(agents)).toBe(true)
	})
})
