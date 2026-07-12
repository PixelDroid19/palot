/**
 * Session store must use the real cli-chat-persistence localStorage shape.
 */
import { afterEach, describe, expect, test } from "bun:test"
import {
	sessionStore,
	sessionStoreInternals,
} from "../src/renderer/lit/session-store"

const { INDEX_KEY, SESSION_KEY_PREFIX } = sessionStoreInternals

// Minimal localStorage for bun:test
const mem = new Map<string, string>()
const ls = {
	getItem: (k: string) => mem.get(k) ?? null,
	setItem: (k: string, v: string) => {
		mem.set(k, v)
	},
	removeItem: (k: string) => {
		mem.delete(k)
	},
	clear: () => mem.clear(),
}
// @ts-expect-error test shim
globalThis.localStorage = ls

afterEach(() => {
	mem.clear()
})

describe("lit sessionStore (shipped persistence shape)", () => {
	test("reads gcode:cliSessions as string[] + payload files", () => {
		const id = "sess-1"
		ls.setItem(INDEX_KEY, JSON.stringify([id]))
		ls.setItem(
			SESSION_KEY_PREFIX + id,
			JSON.stringify({
				session: { id, title: "Dark mode work", time: { created: 1, updated: 2 } },
				directory: "/proj",
				meta: { runtimeId: "codex", cwd: "/proj", sandbox: "workspace-write", threadId: null },
				messages: [
					{ id: "m1", role: "user", time: { created: 1 } },
					{ id: "m2", role: "assistant", time: { created: 2 } },
				],
				parts: {
					m1: [{ type: "text", text: "hello", messageID: "m1" }],
					m2: [{ type: "text", text: "world", messageID: "m2" }],
				},
			}),
		)
		sessionStore.refresh()
		const list = sessionStore.list()
		expect(list).toHaveLength(1)
		expect(list[0].id).toBe(id)
		expect(list[0].title).toBe("Dark mode work")
		expect(list[0].runtimeId).toBe("codex")
		expect(list[0].directory).toBe("/proj")
		const msgs = sessionStore.getMessages(id)
		expect(msgs).toEqual([
			{ id: "m1", role: "user", text: "hello" },
			{ id: "m2", role: "assistant", text: "world" },
		])
	})

	test("upsertAndPersist writes index + payload that refresh can read", () => {
		sessionStore.upsertAndPersist({
			id: "new-1",
			title: "New session",
			runtimeId: "claude",
			directory: "/x",
		})
		const ids = JSON.parse(ls.getItem(INDEX_KEY) || "[]") as string[]
		expect(ids).toContain("new-1")
		const raw = ls.getItem(SESSION_KEY_PREFIX + "new-1")
		expect(raw).toBeTruthy()
		const payload = JSON.parse(raw!) as {
			meta: { runtimeId: string }
			session: { title: string }
		}
		expect(payload.meta.runtimeId).toBe("claude")
		expect(payload.session.title).toBe("New session")
		sessionStore.refresh()
		expect(sessionStore.list().some((s) => s.id === "new-1")).toBe(true)
	})

	test("appendMessage persists transcript text parts", () => {
		sessionStore.upsertAndPersist({
			id: "chat-1",
			title: "Chat",
			runtimeId: "codex",
		})
		sessionStore.appendMessage("chat-1", {
			id: "u1",
			role: "user",
			text: "ping",
		})
		const msgs = sessionStore.getMessages("chat-1")
		expect(msgs.some((m) => m.text === "ping" && m.role === "user")).toBe(true)
	})

	test("persists descriptor-driven model, effort and sandbox choices", () => {
		sessionStore.upsertAndPersist({
			id: "configured-1",
			title: "Configured session",
			runtimeId: "codex",
			directory: "/workspace",
			model: "gpt-5.1-codex",
			effort: "high",
			sandbox: "read-only",
		})
		expect(sessionStore.getMeta("configured-1")).toMatchObject({
			model: "gpt-5.1-codex",
			effort: "high",
			sandbox: "read-only",
		})
	})

	test("renames a persisted session without losing its runtime metadata", () => {
		sessionStore.upsertAndPersist({
			id: "rename-1",
			title: "Untitled",
			runtimeId: "claude",
			directory: "/workspace",
		})
		sessionStore.rename("rename-1", "Review renderer")
		expect(sessionStore.list().find((session) => session.id === "rename-1")).toMatchObject({
			title: "Review renderer",
			runtimeId: "claude",
		})
		expect(sessionStore.getMeta("rename-1")?.runtimeId).toBe("claude")
	})
})
