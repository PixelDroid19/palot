/**
 * Lit chat runtime public API — fail-closed, no offline success, no auto-allow.
 */
import { afterEach, describe, expect, test } from "bun:test"
import {
	respondLitPermission,
	runLitAgentTurn,
} from "../src/renderer/lit/chat-runtime"
import { sessionStore } from "../src/renderer/lit/session-store"

const mem = new Map<string, string>()
// @ts-expect-error test shim
globalThis.localStorage = {
	getItem: (k: string) => mem.get(k) ?? null,
	setItem: (k: string, v: string) => mem.set(k, v),
	removeItem: (k: string) => mem.delete(k),
	clear: () => mem.clear(),
}

afterEach(() => {
	mem.clear()
	// @ts-expect-error cleanup
	delete globalThis.window
})

describe("runLitAgentTurn (public)", () => {
	test("opens and prompts agentSession with session meta", async () => {
		const opens: unknown[] = []
		const prompts: unknown[] = []
		const updates: Array<(sid: string, u: Record<string, unknown>) => void> = []

		// @ts-expect-error test window
		globalThis.window = {
			gcode: {
				agentSession: {
					open: async (sessionId: string, runtimeId: string, opts: unknown) => {
						opens.push({ sessionId, runtimeId, opts })
						return { threadId: "t1" }
					},
					prompt: async (sessionId: string, opts: unknown) => {
						prompts.push({ sessionId, opts })
						for (const cb of updates) {
							cb(sessionId, { kind: "text-delta", text: "Hello" })
						}
						return { message: "Hello from codex", status: "ok" }
					},
					onUpdate: (cb: (sid: string, u: Record<string, unknown>) => void) => {
						updates.push(cb)
						return () => {
							const i = updates.indexOf(cb)
							if (i >= 0) updates.splice(i, 1)
						}
					},
					respondPermission: async () => true,
				},
			},
		}

		sessionStore.upsertAndPersist({
			id: "s1",
			title: "T",
			runtimeId: "codex",
			directory: "/repo",
		})

		const deltas: string[] = []
		const tools: string[] = []
		const final = await runLitAgentTurn("s1", "hi", {
			onAssistantDelta: (t) => deltas.push(t),
			onTool: (t) => tools.push(t.name),
		})
		expect(opens).toHaveLength(1)
		expect((opens[0] as { runtimeId: string }).runtimeId).toBe("codex")
		expect((opens[0] as { opts: { cwd: string } }).opts.cwd).toBe("/repo")
		expect(prompts).toHaveLength(1)
		expect((prompts[0] as { opts: { text: string } }).opts.text).toBe("hi")
		expect(final).toContain("Hello")
		expect(deltas.length).toBeGreaterThan(0)
	})

	test("emits permission without auto-responding", async () => {
		const permissionCalls: string[] = []
		const updates: Array<(sid: string, u: Record<string, unknown>) => void> = []
		const respondCalls: unknown[] = []

		// @ts-expect-error test window
		globalThis.window = {
			gcode: {
				agentSession: {
					open: async () => ({ threadId: "t1" }),
					prompt: async (sessionId: string) => {
						for (const cb of updates) {
							cb(sessionId, {
								kind: "permission",
								request: {
									requestId: "perm-1",
									name: "bash",
									detail: "run ls",
								},
							})
						}
						return { message: "ok", status: "ok" }
					},
					onUpdate: (cb: (sid: string, u: Record<string, unknown>) => void) => {
						updates.push(cb)
						return () => {}
					},
					respondPermission: async (sid: string, requestId: string, decision: string) => {
						respondCalls.push({ sid, requestId, decision })
						return true
					},
				},
			},
		}

		sessionStore.upsertAndPersist({
			id: "s-perm",
			title: "P",
			runtimeId: "claude",
			directory: "/repo",
		})

		await runLitAgentTurn("s-perm", "ls", {
			onPermission: (req) => permissionCalls.push(req.requestId),
		})

		expect(permissionCalls).toEqual(["perm-1"])
		// auto-allow must not happen during the turn
		expect(respondCalls).toHaveLength(0)

		const ok = await respondLitPermission("s-perm", "perm-1", "allow")
		expect(ok).toBe(true)
		expect(respondCalls).toHaveLength(1)
		expect((respondCalls[0] as { decision: string }).decision).toBe("allow")
	})

	test("fails closed when session has no runtime", async () => {
		// @ts-expect-error test window
		globalThis.window = { gcode: { agentSession: {} } }
		sessionStore.upsertAndPersist({
			id: "s-none",
			title: "N",
			runtimeId: "unknown",
			directory: "",
		})
		await expect(runLitAgentTurn("s-none", "hi")).rejects.toThrow(/no runtime/i)
	})

	test("fails closed for Claude/Codex without agentSession bridge", async () => {
		// @ts-expect-error test window
		globalThis.window = {}
		sessionStore.upsertAndPersist({
			id: "s2",
			title: "T",
			runtimeId: "claude",
			directory: "/repo",
		})
		await expect(runLitAgentTurn("s2", "hi")).rejects.toThrow(/bridge/i)
	})

	test("OpenCode uses the same agentSession bridge as other CLI runtimes", async () => {
		const calls: string[] = []
		// @ts-expect-error test window
		globalThis.window = {
			gcode: {
				agentSession: {
					open: async (_id: string, runtimeId: string) => {
						calls.push(`open:${runtimeId}`)
						return { threadId: "acp-session" }
					},
					prompt: async () => {
						calls.push("prompt")
						return { message: "from opencode acp" }
					},
					onUpdate: () => () => {},
					respondPermission: async () => true,
				},
			},
		}
		sessionStore.upsertAndPersist({
			id: "oc1",
			title: "OC",
			runtimeId: "opencode",
			directory: "/repo",
		})
		await expect(runLitAgentTurn("oc1", "hi")).resolves.toBe("from opencode acp")
		expect(calls).toEqual(["open:opencode", "prompt"])
	})
})
