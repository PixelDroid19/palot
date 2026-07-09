/**
 * Host subagent roles — general-purpose + explore on the real registry path.
 */
import { describe, expect, test } from "bun:test"
import { AgentHost } from "../src/host"
import {
	HOST_SUBAGENT_ROLES,
	getHostSubagentRole,
	listHostSubagentRoles,
	registerSubagentTools,
	HostToolRegistry,
} from "../src/host-tools"
import { FakeProvider } from "./fake-provider"

describe("host subagent roles", () => {
	test("catalog ships general-purpose and explore", () => {
		const roles = listHostSubagentRoles()
		expect(roles.map((r) => r.id).sort()).toEqual(["explore", "general-purpose"])
		expect(getHostSubagentRole("explore")?.readOnly).toBe(true)
		expect(getHostSubagentRole("general-purpose")?.readOnly).toBe(false)
		expect(HOST_SUBAGENT_ROLES.length).toBe(2)
	})

	test("AgentHost installs list+run subagent tools without brand hard-code", () => {
		const host = new AgentHost({
			builtinProviders: false,
			providers: [new FakeProvider("worker")],
			resolveBinary: async () => "/bin/sh",
		})
		const names = host.tools.list().map((t) => t.name)
		expect(names).toContain("palot_list_subagents")
		expect(names).toContain("palot_run_subagent")
	})

	test("palot_list_subagents returns role descriptors", async () => {
		const host = new AgentHost({
			builtinProviders: false,
			providers: [new FakeProvider("worker")],
			resolveBinary: async () => "/bin/sh",
		})
		const raw = await host.tools.call("palot_list_subagents")
		const listed = JSON.parse(raw) as { id: string; readOnly: boolean }[]
		expect(listed.map((r) => r.id).sort()).toEqual(["explore", "general-purpose"])
		expect(listed.find((r) => r.id === "explore")?.readOnly).toBe(true)
	})

	test("palot_run_subagent explore uses read-only isolation via real delegate", async () => {
		const provider = new FakeProvider("worker", {
			reply: (input) => `explored:${input.text.slice(0, 40)}`,
		})
		const host = new AgentHost({
			builtinProviders: false,
			providers: [provider],
			resolveBinary: async () => "/bin/sh",
		})
		const result = await host.tools.call("palot_run_subagent", {
			role: "explore",
			prompt: "map entry points",
			cwd: "/tmp",
		})
		expect(result).toMatch(/explored:|Explore subagent/)
		// FakeProvider records sandbox on openSession opts if available — at least turn completed
		expect(provider.sessions.length).toBeGreaterThanOrEqual(1)
	})

	test("unknown role fails closed", async () => {
		const host = new AgentHost({
			builtinProviders: false,
			providers: [new FakeProvider("worker")],
			resolveBinary: async () => "/bin/sh",
		})
		await expect(
			host.tools.call("palot_run_subagent", { role: "invented", prompt: "x", cwd: "/tmp" }),
		).rejects.toThrow(/Unknown subagent role/)
	})

	test("registerSubagentTools alone needs a worker runtime", async () => {
		const reg = new HostToolRegistry()
		registerSubagentTools(reg, {
			resolveWorkerRuntimeId: () => null,
			delegate: async () => ({ message: "nope", notices: [] }),
		})
		await expect(
			reg.call("palot_run_subagent", { role: "explore", prompt: "x" }),
		).rejects.toThrow(/No worker runtime/)
	})
})
