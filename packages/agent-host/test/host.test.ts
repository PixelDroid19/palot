import { describe, expect, test } from "bun:test"
import { AgentHost } from "../src/host"
import type { AgentAdapter } from "../src/types"

/**
 * A fake adapter backed by the system shell, so host behavior (queueing,
 * serialization, cancellation, events) is tested against real processes
 * without any AI CLI installed.
 */
function shellAdapter(id: string, script: (prompt: string) => string): AgentAdapter {
	return {
		id,
		displayName: id,
		binary: "sh",
		buildCommand: (opts) => ({ args: ["-c", script(opts.prompt)] }),
		parseLine: (line) => (line.trim() ? [{ kind: "message", text: line.trim() }] : []),
	}
}

function makeHost(adapters: AgentAdapter[], maxConcurrentRuns = 8): AgentHost {
	const host = new AgentHost({
		builtinAdapters: false,
		maxConcurrentRuns,
		resolveBinary: async () => "/bin/sh",
	})
	for (const a of adapters) host.adapters.register(a)
	return host
}

describe("AgentHost", () => {
	test("runs a turn and returns the reduced result", async () => {
		const host = makeHost([shellAdapter("echo", () => "echo hello")])
		const result = await host.run("r1", "echo", { prompt: "hi", cwd: "/tmp" })
		expect(result.message).toBe("hello")
	})

	test("rejects unknown runtimes and empty prompts", async () => {
		const host = makeHost([])
		await expect(host.run("r", "nope", { prompt: "x", cwd: "/tmp" })).rejects.toThrow(
			"Unknown agent runtime",
		)
		await expect(host.run("r", "nope", { prompt: "  ", cwd: "/tmp" })).rejects.toThrow(
			"prompt is required",
		)
	})

	test("serializes runs on the same sessionKey, parallelizes across sessions", async () => {
		const host = makeHost([
			shellAdapter("slow", () => "sleep 0.15; echo done"),
			shellAdapter("fast", () => "echo quick"),
		])
		const order: string[] = []
		const first = host
			.run("a", "slow", { prompt: "x", cwd: "/tmp" }, { sessionKey: "s1" })
			.then(() => order.push("first"))
		const second = host
			.run("b", "fast", { prompt: "x", cwd: "/tmp" }, { sessionKey: "s1" })
			.then(() => order.push("second"))
		const other = host
			.run("c", "fast", { prompt: "x", cwd: "/tmp" }, { sessionKey: "s2" })
			.then(() => order.push("other"))
		await Promise.all([first, second, other])
		// Same session: strict order. Different session: finishes before the slow one.
		expect(order.indexOf("first")).toBeLessThan(order.indexOf("second"))
		expect(order.indexOf("other")).toBeLessThan(order.indexOf("first"))
	})

	test("caps global concurrency", async () => {
		const host = makeHost(
			[shellAdapter("sleepy", () => "sleep 0.1; echo ok")],
			2,
		)
		const started = Date.now()
		await Promise.all(
			["1", "2", "3", "4"].map((n) =>
				host.run(`r${n}`, "sleepy", { prompt: "x", cwd: "/tmp" }),
			),
		)
		// 4 runs, 2 at a time, 100ms each → at least ~200ms.
		expect(Date.now() - started).toBeGreaterThanOrEqual(180)
	})

	test("cancel kills a running process", async () => {
		const host = makeHost([shellAdapter("hang", () => "sleep 30")])
		const pending = host.run("kill-me", "hang", { prompt: "x", cwd: "/tmp" })
		await new Promise((r) => setTimeout(r, 100))
		expect(host.cancel("kill-me")).toBe(true)
		await expect(pending).rejects.toThrow("cancelled")
	})

	test("timeout rejects with a diagnosable error", async () => {
		const host = makeHost([shellAdapter("hang", () => "sleep 30")])
		await expect(
			host.run("t", "hang", { prompt: "x", cwd: "/tmp", timeoutMs: 150 }),
		).rejects.toThrow("timed out")
	})

	test("non-zero exit surfaces stderr", async () => {
		const host = makeHost([shellAdapter("fail", () => "echo bad >&2; exit 3")])
		await expect(host.run("f", "fail", { prompt: "x", cwd: "/tmp" })).rejects.toThrow("bad")
	})

	test("emits run lifecycle events", async () => {
		const host = makeHost([shellAdapter("echo", () => "echo hey")])
		const events: string[] = []
		host.events.on("run:start", () => events.push("start"))
		host.events.on("run:update", ({ update }) => events.push(update.kind))
		host.events.on("run:end", ({ ok }) => events.push(`end:${ok}`))
		await host.run("e", "echo", { prompt: "x", cwd: "/tmp" })
		expect(events[0]).toBe("start")
		expect(events).toContain("message")
		expect(events[events.length - 1]).toBe("end:true")
	})

	test("delegate runs a one-shot task on another runtime", async () => {
		const host = makeHost([shellAdapter("peer", () => "echo delegated-result")])
		const result = await host.delegate({ runtimeId: "peer", prompt: "go", cwd: "/tmp" })
		expect(result.message).toBe("delegated-result")
	})
})
