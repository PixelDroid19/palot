import { describe, expect, test } from "bun:test"

import type { PalotEvent } from "@palot/events"
import {
	getDiffsForSession,
	getPendingPermissions,
	getPendingQuestions,
	initialCoreState,
	sessionLifecycleReducer,
} from "../src/sessions"

describe("sessionLifecycleReducer", () => {
	test("handles session.created", () => {
		const event: PalotEvent = {
			type: "session.created",
			at: Date.now(),
			session: { id: "s1", workspaceId: "w1", title: "First", status: "idle" },
		}
		const next = sessionLifecycleReducer(initialCoreState, event)
		expect(next.sessions.s1).toMatchObject({ id: "s1", title: "First", status: "idle" })
	})

	test("handles session.status.changed", () => {
		const created: PalotEvent = {
			type: "session.created",
			at: 1,
			session: { id: "s1", workspaceId: "w1", status: "idle" },
		}
		let state = sessionLifecycleReducer(initialCoreState, created)
		const changed: PalotEvent = {
			type: "session.status.changed",
			at: 2,
			sessionId: "s1",
			status: "busy",
		}
		state = sessionLifecycleReducer(state, changed)
		expect(state.sessions.s1.status).toBe("busy")
	})

	test("handles session.deleted", () => {
		const created: PalotEvent = {
			type: "session.created",
			at: 1,
			session: { id: "s1", workspaceId: "w1", status: "idle" },
		}
		let state = sessionLifecycleReducer(initialCoreState, created)
		const deleted: PalotEvent = { type: "session.deleted", at: 3, sessionId: "s1" }
		state = sessionLifecycleReducer(state, deleted)
		expect(state.sessions.s1).toBeUndefined()
	})

	test("handles message upsert + delta + part remove + diff + delete cleans", () => {
		let state = initialCoreState
		state = sessionLifecycleReducer(state, {
			type: "session.created",
			at: 1,
			session: { id: "s1", workspaceId: "w1", status: "idle" },
		} as PalotEvent)
		state = sessionLifecycleReducer(state, {
			type: "message.upserted",
			at: 2,
			sessionId: "s1",
			message: { id: "m1", role: "assistant", parts: [{ id: "p1", type: "text", content: "hi" }] },
		} as PalotEvent)
		state = sessionLifecycleReducer(state, {
			type: "message.part.delta",
			at: 3,
			sessionId: "s1",
			messageId: "m1",
			partId: "p1",
			field: "content",
			delta: " there",
		} as PalotEvent)
		state = sessionLifecycleReducer(state, {
			type: "session.diff.updated",
			at: 4,
			sessionId: "s1",
			diff: { id: "d1", sessionId: "s1", filePath: "f.ts", patch: "+hi" },
		} as PalotEvent)
		expect(state.messages.s1.m1.parts.p1.content).toBe("hi there")
		expect(Object.keys(state.diffs).length).toBe(1)
		const removed = sessionLifecycleReducer(state, {
			type: "message.part.removed",
			at: 5,
			sessionId: "s1",
			messageId: "m1",
			partId: "p1",
		} as PalotEvent)
		expect(removed.messages.s1.m1.parts.p1).toBeUndefined()
		// delete cleans diffs
		const delState = sessionLifecycleReducer(state, {
			type: "session.deleted",
			at: 6,
			sessionId: "s1",
		} as PalotEvent)
		expect(delState.diffs.d1).toBeUndefined()
	})

	test("get helpers for pending perm/q and diffs", () => {
		let state = initialCoreState
		state = sessionLifecycleReducer(state, {
			type: "session.created",
			at: 10,
			session: { id: "s2", workspaceId: "w1", status: "busy" },
		} as PalotEvent)
		state = sessionLifecycleReducer(state, {
			type: "permission.requested",
			at: 11,
			sessionId: "s2",
			request: { id: "pr1", tool: "edit" },
		} as PalotEvent)
		state = sessionLifecycleReducer(state, {
			type: "question.requested",
			at: 12,
			sessionId: "s2",
			request: { id: "q1", prompt: "?" },
		} as PalotEvent)
		state = sessionLifecycleReducer(state, {
			type: "session.diff.updated",
			at: 13,
			sessionId: "s2",
			diff: { id: "dd", sessionId: "s2", filePath: "x" },
		} as PalotEvent)
		expect(getPendingPermissions(state, "s2").length).toBe(1)
		expect(getPendingQuestions(state, "s2").length).toBe(1)
		expect(getDiffsForSession(state, "s2").length).toBe(1)
	})
})
