/**
 * getAgentHost hot-upgrade wiring + heal under suite isolation.
 *
 * Heal logic lives in host-tool-plane (no Electron). getAgentHost calls it on
 * an existing singleton — proven here by (1) source wiring of service.ts and
 * (2) the same ensureHostToolPlaneComplete function with the desktop-shaped
 * backend installer callback. Does not import agents/service (avoids
 * process-wide mock pollution from automation executor tests).
 */
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { AgentHost, registerDefaultPlatformTools } from "@palot/agent-host"
import {
	REQUIRED_HOST_TOOLS,
	ensureHostToolPlaneComplete,
	listMissingHostTools,
} from "../src/main/agents/host-tool-plane"

function installStubBackends(host: AgentHost): void {
	registerDefaultPlatformTools(host.tools)
}

/**
 * Mirrors the getAgentHost() branch for an existing singleton:
 *   else { ensureHostToolPlaneComplete(hostSingleton) }
 * so we exercise the product control flow without the Electron service graph.
 */
function getAgentHostHotPath(existing: AgentHost): AgentHost {
	ensureHostToolPlaneComplete(existing, installStubBackends)
	return existing
}

describe("getAgentHost hot-upgrade heal entry", () => {
	test("service.getAgentHost wires ensureHostToolPlaneComplete on existing singleton", () => {
		const src = readFileSync(
			join(import.meta.dir, "../src/main/agents/service.ts"),
			"utf8",
		)
		// Product path: existing singleton → heal, not only first-create install.
		expect(src).toMatch(/if\s*\(\s*!hostSingleton\s*\)/)
		expect(src).toMatch(/ensureHostToolPlaneComplete\s*\(\s*hostSingleton\s*\)/)
		expect(src).toMatch(/installDesktopHostToolBackends\s*\(\s*hostSingleton\s*\)/)
	})

	test("getAgentHost hot path reinstalls missing subagents on existing singleton", async () => {
		const incomplete = new AgentHost({
			builtinProviders: false,
			resolveBinary: async () => null,
		})
		incomplete.tools.unregister("palot_list_subagents")
		incomplete.tools.unregister("palot_run_subagent")
		expect(listMissingHostTools(incomplete)).toContain("palot_list_subagents")

		// Same control flow as getAgentHost() when hostSingleton is already set.
		const host = getAgentHostHotPath(incomplete)
		expect(host).toBe(incomplete)
		expect(host.tools.has("palot_list_subagents")).toBe(true)
		expect(host.tools.has("palot_run_subagent")).toBe(true)

		const roles = JSON.parse(await host.tools.call("palot_list_subagents")) as { id: string }[]
		expect(roles.map((r) => r.id).sort()).toEqual(["explore", "general-purpose"])
	})

	test("ensureHostToolPlaneComplete restores full required plane", () => {
		const host = new AgentHost({
			builtinProviders: false,
			resolveBinary: async () => null,
			registerHostTools: false,
		})
		const missing = ensureHostToolPlaneComplete(host, installStubBackends)
		expect(missing.length).toBeGreaterThan(0)
		for (const name of REQUIRED_HOST_TOOLS) {
			expect(host.tools.has(name)).toBe(true)
		}
		expect(listMissingHostTools(host)).toEqual([])
	})
})
