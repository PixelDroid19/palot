/**
 * Transcript handoff across runtime switches.
 * Drives shipped helpers against the real Jotai appStore (no re-implementation).
 */
import { beforeEach, describe, expect, test } from "bun:test"

// Node test env has no DOM storage; persistence only needs a Map-backed shim.
const memoryStore = new Map<string, string>()
Object.defineProperty(globalThis, "localStorage", {
	value: {
		getItem: (k: string) => memoryStore.get(k) ?? null,
		setItem: (k: string, v: string) => {
			memoryStore.set(k, v)
		},
		removeItem: (k: string) => {
			memoryStore.delete(k)
		},
		clear: () => memoryStore.clear(),
	},
	configurable: true,
})
import { clearCliMeta, getCliMeta, setCliMeta } from "../src/renderer/atoms/cli-sessions"
import { messagesFamily, upsertMessageAtom } from "../src/renderer/atoms/messages"
import { partsFamily, upsertPartAtom } from "../src/renderer/atoms/parts"
import {
	removeSessionAtom,
	sessionFamily,
	upsertSessionAtom,
} from "../src/renderer/atoms/sessions"
import { appStore } from "../src/renderer/atoms/store"
import {
	buildConversationHandoff,
	buildRuntimeHandoffPreamble,
	consumeManagedRuntimeHandoff,
	transferSessionTranscript,
	switchSessionToManagedServer,
} from "../src/renderer/services/cli-chat-session"
import type { Session, TextPart, UserMessage } from "../src/renderer/lib/types"

function seedSession(sessionId: string, directory: string, title: string): void {
	appStore.set(upsertSessionAtom, {
		session: {
			id: sessionId,
			title,
			directory,
			time: { created: Date.now() },
		} as Session,
		directory,
	})
}

function seedTurn(sessionId: string, userText: string, asstText: string, ts: number): void {
	const userId = `msg-${ts}-u`
	const asstId = `msg-${ts}-a`
	appStore.set(upsertMessageAtom, {
		id: userId,
		sessionID: sessionId,
		role: "user",
		time: { created: ts },
		agent: "codex",
		model: { providerID: "cli", modelID: "codex" },
	} as UserMessage)
	appStore.set(upsertPartAtom, {
		id: `${userId}-t`,
		sessionID: sessionId,
		messageID: userId,
		type: "text",
		text: userText,
	} as TextPart)
	appStore.set(upsertMessageAtom, {
		id: asstId,
		sessionID: sessionId,
		role: "assistant",
		time: { created: ts + 1 },
		parentID: userId,
		modelID: "codex",
		providerID: "cli",
		mode: "build",
		path: { cwd: "/ws", root: "/ws" },
		cost: 0,
		tokens: {
			input: 0,
			output: 0,
			reasoning: 0,
			cache: { read: 0, write: 0 },
		},
	} as never)
	appStore.set(upsertPartAtom, {
		id: `${asstId}-t`,
		sessionID: sessionId,
		messageID: asstId,
		type: "text",
		text: asstText,
	} as TextPart)
}

describe("transferSessionTranscript", () => {
	const fromId = "sess-from"
	const toId = "sess-to"

	beforeEach(() => {
		// Isolate: clear known sessions
		for (const id of [fromId, toId]) {
			const msgs = appStore.get(messagesFamily(id)) ?? []
			for (const m of msgs) {
				appStore.set(partsFamily(m.id), [])
			}
			appStore.set(messagesFamily(id), [])
			appStore.set(removeSessionAtom, id)
			clearCliMeta(id)
		}
	})

	test("moves messages and keeps parts readable after source session is removed", () => {
		seedSession(fromId, "/ws", "Codex chat")
		seedTurn(fromId, "fix the bug", "I will investigate auth.ts", 1000)

		expect(appStore.get(messagesFamily(fromId)).length).toBe(2)
		expect(buildConversationHandoff(fromId)).toContain("fix the bug")
		expect(buildConversationHandoff(fromId)).toContain("auth.ts")

		seedSession(toId, "/ws", "OpenCode chat")
		const moved = transferSessionTranscript(fromId, toId)
		expect(moved).toBe(2)

		// Source detached without destroying parts
		expect(appStore.get(messagesFamily(fromId)).length).toBe(0)
		expect(appStore.get(messagesFamily(toId)).length).toBe(2)
		expect(appStore.get(messagesFamily(toId)).every((m) => m.sessionID === toId)).toBe(true)

		// Parts still available by original message id
		const userMsg = appStore.get(messagesFamily(toId)).find((m) => m.role === "user")!
		const parts = appStore.get(partsFamily(userMsg.id))
		expect(parts.some((p) => p.type === "text" && (p as TextPart).text.includes("fix the bug"))).toBe(
			true,
		)

		// removeSessionAtom on empty source must not wipe destination parts
		appStore.set(removeSessionAtom, fromId)
		expect(appStore.get(partsFamily(userMsg.id)).length).toBeGreaterThan(0)
		expect(appStore.get(messagesFamily(toId)).length).toBe(2)
	})
})

describe("switchSessionToManagedServer", () => {
	const fromId = "cli-sess-1"

	beforeEach(() => {
		appStore.set(removeSessionAtom, fromId)
		clearCliMeta(fromId)
		// clear any leftover managed sessions from prior runs
		for (const id of ["managed-new-1", "managed-new-2"]) {
			appStore.set(removeSessionAtom, id)
		}
	})

	test("creates managed session, transfers transcript, stages handoff, clears cli meta", async () => {
		seedSession(fromId, "/proj", "CLI work")
		seedTurn(fromId, "add tests", "Added unit tests for handoff", 2000)
		setCliMeta(fromId, {
			runtimeId: "codex",
			cwd: "/proj",
			sandbox: "read-only",
			threadId: "thr-1",
		})

		const nextId = await switchSessionToManagedServer(fromId, async (directory, title) => {
			expect(directory).toBe("/proj")
			expect(title).toBe("CLI work")
			const session = {
				id: "managed-new-1",
				title: title ?? "t",
				directory,
				time: { created: Date.now() },
			} as Session
			appStore.set(upsertSessionAtom, { session, directory })
			return session
		})

		expect(nextId).toBe("managed-new-1")
		expect(getCliMeta(fromId)).toBeUndefined()
		expect(appStore.get(sessionFamily(fromId))).toBeNull()
		expect(appStore.get(messagesFamily("managed-new-1")).length).toBe(2)
		expect(buildConversationHandoff("managed-new-1")).toContain("add tests")

		const handoff = consumeManagedRuntimeHandoff("managed-new-1")
		expect(handoff).toBeTruthy()
		expect(handoff).toContain("conversation-history")
		expect(handoff).toContain("add tests")
		// one-shot
		expect(consumeManagedRuntimeHandoff("managed-new-1")).toBeNull()
	})
})

describe("handoff preamble", () => {
	test("wraps history for the next model turn", () => {
		const text = buildRuntimeHandoffPreamble("User: hi\n\nAssistant: hello")
		expect(text).toContain("<conversation-history>")
		expect(text).toContain("User: hi")
		expect(text).toContain("Continue seamlessly")
	})
})
