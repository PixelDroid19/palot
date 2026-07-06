import { describe, expect, test } from "bun:test"
import { AgentHost } from "../src/host"
import type { AgentUpdate } from "../src/types"
import { FakeProvider } from "./fake-provider"

function makeHost(providers: FakeProvider[]): AgentHost {
	const host = new AgentHost({ builtinProviders: false, resolveBinary: async () => "/bin/sh" })
	for (const p of providers) host.registerProvider(p)
	return host
}

describe("AgentHost sessions", () => {
	test("opens a session, runs turns, keeps the same underlying session", async () => {
		const provider = new FakeProvider("fake")
		const host = makeHost([provider])
		await host.openSession("s1", "fake", { cwd: "/tmp" })
		const first = await host.prompt("s1", { text: "hola" })
		const second = await host.prompt("s1", { text: "otra" })
		expect(first.message).toBe("echo:hola")
		expect(second.message).toBe("echo:otra")
		expect(provider.sessions).toHaveLength(1)
		expect(provider.sessions[0]?.turns).toHaveLength(2)
	})

	test("emits session updates and turn lifecycle events", async () => {
		const provider = new FakeProvider("fake")
		const host = makeHost([provider])
		const updates: AgentUpdate[] = []
		const lifecycle: string[] = []
		host.events.on("session:update", (e) => updates.push(e.update))
		host.events.on("turn:start", () => lifecycle.push("start"))
		host.events.on("turn:end", () => lifecycle.push("end"))
		await host.openSession("s1", "fake", { cwd: "/tmp" })
		await host.prompt("s1", { text: "hola" })
		expect(lifecycle).toEqual(["start", "end"])
		expect(updates.some((u) => u.kind === "thread")).toBe(true)
		expect(updates.some((u) => u.kind === "message")).toBe(true)
	})

	test("permission requests round-trip through the host", async () => {
		const provider = new FakeProvider("fake", { askPermission: true })
		const host = makeHost([provider])
		host.events.on("session:update", (e) => {
			if (e.update.kind === "permission") {
				host.respondPermission("s1", e.update.request.requestId, "acceptForSession")
			}
		})
		await host.openSession("s1", "fake", { cwd: "/tmp" })
		await host.prompt("s1", { text: "do it" })
		expect(provider.sessions[0]?.lastDecision).toBe("acceptForSession")
	})

	test("interrupt stops the running turn but keeps the session usable", async () => {
		const provider = new FakeProvider("fake", { delayMs: 100 })
		const host = makeHost([provider])
		await host.openSession("s1", "fake", { cwd: "/tmp" })
		const turn = host.prompt("s1", { text: "long task" })
		await new Promise((r) => setTimeout(r, 10))
		expect(await host.interrupt("s1")).toBe(true)
		const result = await turn
		expect(result.message).toBe("(interrupted)")
		const next = await host.prompt("s1", { text: "again" })
		expect(next.message).toBe("echo:again")
	})

	test("steer feeds input into the running turn", async () => {
		const provider = new FakeProvider("fake", { delayMs: 60 })
		const host = makeHost([provider])
		await host.openSession("s1", "fake", { cwd: "/tmp" })
		const turn = host.prompt("s1", { text: "task" })
		await new Promise((r) => setTimeout(r, 10))
		await host.steer("s1", "also do X")
		await turn
		expect(provider.sessions[0]?.steered).toEqual(["also do X"])
	})

	test("closeSession tears the session down", async () => {
		const provider = new FakeProvider("fake")
		const host = makeHost([provider])
		await host.openSession("s1", "fake", { cwd: "/tmp" })
		await host.closeSession("s1")
		expect(provider.sessions[0]?.closedCount).toBe(1)
		expect(host.getSession("s1")).toBeNull()
		await expect(host.prompt("s1", { text: "x" })).rejects.toThrow("No open session")
	})

	test("rejects unknown runtimes and empty prompts", async () => {
		const host = makeHost([new FakeProvider("fake")])
		await expect(host.openSession("s1", "nope", { cwd: "/tmp" })).rejects.toThrow(
			"Unknown agent runtime",
		)
		await host.openSession("s2", "fake", { cwd: "/tmp" })
		await expect(host.prompt("s2", { text: "  " })).rejects.toThrow("required")
	})

	test("describeRuntimes exposes capabilities and models", async () => {
		const host = makeHost([new FakeProvider("fake")])
		const descriptors = await host.describeRuntimes()
		expect(descriptors).toHaveLength(1)
		expect(descriptors[0]?.installed).toBe(true)
		expect(descriptors[0]?.capabilities.permissions).toBe(true)
		expect(descriptors[0]?.models[0]?.efforts).toEqual(["low", "high"])
	})

	test("delegate runs an ephemeral session and closes it", async () => {
		const provider = new FakeProvider("fake")
		const host = makeHost([provider])
		const result = await host.delegate({ runtimeId: "fake", prompt: "ping", cwd: "/tmp" })
		expect(result.message).toBe("echo:ping")
		expect(provider.sessions).toHaveLength(1)
		expect(provider.sessions[0]?.closedCount).toBe(1)
	})

	test("delegate auto-declines permission requests", async () => {
		const provider = new FakeProvider("fake", { askPermission: true })
		const host = makeHost([provider])
		await host.delegate({ runtimeId: "fake", prompt: "risky", cwd: "/tmp" })
		expect(provider.sessions[0]?.lastDecision).toBe("decline")
	})
})
