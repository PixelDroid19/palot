/**
 * Lit chat runtime must call window.gcode.agentSession (shipped IPC path).
 */
import { afterEach, describe, expect, test } from "bun:test"
import { runLitAgentTurn } from "../src/renderer/lit/chat-runtime"
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

describe("runLitAgentTurn (shipped)", () => {
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
						// simulate stream
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
		const final = await runLitAgentTurn("s1", "hi", {
			onAssistantDelta: (t) => deltas.push(t),
		})
		expect(opens).toHaveLength(1)
		expect((opens[0] as { runtimeId: string }).runtimeId).toBe("codex")
		expect((opens[0] as { opts: { cwd: string } }).opts.cwd).toBe("/repo")
		expect(prompts).toHaveLength(1)
		expect((prompts[0] as { opts: { text: string } }).opts.text).toBe("hi")
		expect(final).toContain("Hello")
		expect(deltas.length).toBeGreaterThan(0)
	})

	test("fails closed for opencode managed-server without React gateway", async () => {
		// @ts-expect-error test window
		globalThis.window = {
			gcode: {
				agentSession: {
					open: async () => ({ threadId: null }),
					prompt: async () => ({ message: "nope" }),
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
		await expect(runLitAgentTurn("oc1", "hi")).rejects.toThrow(/OpenCode|managed-server|workspace/i)
	})
})
