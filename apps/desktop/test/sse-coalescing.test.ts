import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { coalescingKey } from "@desktop/shared"
import { loadEventFixture, replayEventsIntoReducer } from "@palot/events"
import { createHarness } from "@palot/agent-harness"
import { OpenCodeAgentAdapter } from "@palot/agent-adapter-opencode"
import { deriveChatViewModel, initialFullCoreState, rootReducer } from "@palot/core"

describe("coalescingKey", () => {
	test("returns key for message.part.updated", () => {
		const key = coalescingKey({
			type: "message.part.updated",
			properties: { part: { messageID: "msg-1", id: "part-1" } },
		})
		expect(key).toBe("part:msg-1:part-1")
	})

	test("returns key for message.part.delta", () => {
		const key = coalescingKey({
			type: "message.part.delta",
			properties: { messageID: "msg-2", partID: "part-9" },
		})
		expect(key).toBe("part:msg-2:part-9")
	})

	test("returns key for session.status", () => {
		const key = coalescingKey({
			type: "session.status",
			properties: { sessionID: "ses-abc" },
		})
		expect(key).toBe("status:ses-abc")
	})

	test("returns undefined for unrelated events", () => {
		expect(coalescingKey({ type: "session.created", properties: {} })).toBeUndefined()
	})
})

describe("platform replay/harness (desktop unit, no electron)", () => {
	test("replays fixture via events + core reducer (no live provider)", () => {
		const jsonl = readFileSync(
			join(import.meta.dir, "../../../packages/events/fixtures/opencode-session-basic.jsonl"),
			"utf8",
		)
		const events = loadEventFixture(jsonl)
		const state = replayEventsIntoReducer(events, initialFullCoreState, rootReducer)
		expect(state.sessions.sessions["s-basic"]).toBeDefined()
		expect(state.sessions.sessions["s-basic"].status).toBe("idle")
	})

	test("harness + bus + replay integration (simulates harness e2e without full app)", () => {
		const harness = createHarness()
		const received: any[] = []
		harness.bus.subscribe("session.lifecycle" as any, (e) => {
			received.push(e)
		})
		harness.emit({ type: "session.created", at: Date.now(), session: { id: "desk-s", workspaceId: "w", status: "idle" } } as any)
		expect(received.length).toBe(1)
		// use received (emits publish to subs), not rely on getRecorded (off by default)
		const state = replayEventsIntoReducer(
			received.map((env) => env),
			initialFullCoreState,
			rootReducer,
		)
		expect(state.sessions.sessions["desk-s"]).toBeDefined()
	})

	test("creates adapter + harness + core bus + derives VM (desktop unit, no Electron, no E2E)", () => {
		// harness usable from desktop test without Electron (pure, no node fs child etc in renderer path)
		const adapter = new OpenCodeAgentAdapter()
		expect(adapter.id).toBe("opencode")
		expect(typeof adapter.dispatch).toBe("function")

		const harness = createHarness()
		harness.bus.record(true)

		harness.simulateSessionCreated({ id: "desk-adapter-s", workspaceId: "w-desk", status: "busy" })
		harness.simulatePrompt("desk-adapter-s", [
			{ id: "dp1", type: "text", delta: "Desk" },
			{ id: "dp1", type: "text", delta: " test" },
		])
		harness.simulateQuestionRequest("desk-adapter-s", { id: "dq", prompt: "?", options: [{ id: "o1", label: "yes" }] })
		harness.replyToQuestion("dq", [{ optionId: "o1" }])

		const recorded = harness.bus.getRecorded()
		const state = replayEventsIntoReducer(recorded, initialFullCoreState, rootReducer)

		// derive VM from combined
		const vm = deriveChatViewModel(state, "desk-adapter-s")
		expect(vm).not.toBeNull()
		expect(vm!.sessionId).toBe("desk-adapter-s")
		expect(vm!.pendingQuestions.length).toBe(0)
		expect(vm!.turns.length).toBeGreaterThan(0)

		// harness + adapter coexist without electron
		expect(harness.bus).toBeTruthy()
	})
})
