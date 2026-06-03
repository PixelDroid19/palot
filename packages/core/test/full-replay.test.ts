import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createHarness } from "@palot/agent-harness"
import { loadEventFixture, replayEventsIntoReducer } from "@palot/events"

import { initialFullCoreState, rootReducer } from "../src/state"
import { deriveChatViewModel, deriveSidebarViewModel } from "../src/view-models"

function loadFixture(name: string): string {
	return readFileSync(join(import.meta.dir, "../../events/fixtures", name), "utf8")
}

describe("full core replay + view models", () => {
	test("replays permission+question fixture into full state and derives VMs", () => {
		const jsonl = loadFixture("opencode-permission-question.jsonl")
		const events = loadEventFixture(jsonl)

		const finalState = replayEventsIntoReducer(events, initialFullCoreState, rootReducer)

		// session present
		expect(finalState.sessions.sessions["s-perm"]).toBeDefined()
		expect(finalState.sessions.sessions["s-perm"].status).toBe("idle")

		// messages
		const msgs = finalState.sessions.messages["s-perm"]
		expect(Object.keys(msgs).length).toBe(2)

		// permission resolved
		const perm = finalState.sessions.permissions["pr-1"]
		expect(perm).toBeDefined()
		expect(perm.resolved?.response).toBe("allow")

		// question resolved
		const q = finalState.sessions.questions["q-1"]
		expect(q).toBeDefined()
		expect(q.resolved?.answers[0].optionId).toBe("opt-tmp")

		// derive sidebar
		const sidebar = deriveSidebarViewModel(finalState)
		expect(sidebar.sessions.length).toBe(1)
		expect(sidebar.sessions[0].id).toBe("s-perm")

		// derive chat
		const chat = deriveChatViewModel(finalState, "s-perm")
		expect(chat).not.toBeNull()
		expect(chat!.turns.length).toBe(2)
		expect(chat!.pendingPermissions.length).toBe(0)
		expect(chat!.pendingQuestions.length).toBe(0)
	})

	test("replays streaming tool call + diff fixture", () => {
		const jsonl = loadFixture("opencode-streaming-tool-call.jsonl")
		const events = loadEventFixture(jsonl)

		let state = initialFullCoreState
		for (const env of events) {
			state = rootReducer(state, env.event)
		}

		const chat = deriveChatViewModel(state, "s-stream")
		expect(chat).not.toBeNull()
		expect(chat!.turns.length).toBe(2)
		// last turn has multiple parts including tool
		const lastParts = chat!.turns[1].parts
		expect(lastParts.some((p) => p.type === "tool-call")).toBe(true)
		expect(lastParts.some((p) => p.type === "tool-result")).toBe(true)

		// diff recorded? (note: diff not in sessions slice, but event processed ok)
		expect(state.sessions.sessions["s-stream"].status).toBe("idle")
		// now diffs are in core
		const diffs = Object.values(state.sessions.diffs).filter((d) => d.sessionId === "s-stream")
		expect(diffs.length).toBeGreaterThan(0)
		expect(diffs[0].filePath).toBe("foo.ts")
	})

	test("replays error fixture and leaves error status", () => {
		const jsonl = loadFixture("opencode-session-error.jsonl")
		const events = loadEventFixture(jsonl)

		const state = replayEventsIntoReducer(events, initialFullCoreState, rootReducer)
		expect(state.sessions.sessions["s-err"].status).toBe("error")
		expect(state.provider.lastDisconnectReason).toBe("agent crashed")
	})

	test("replays automation fixture", () => {
		const jsonl = loadFixture("automation-run-actionable.jsonl")
		const events = loadEventFixture(jsonl)

		const state = replayEventsIntoReducer(events, initialFullCoreState, rootReducer)
		const runs = state.automations.runs
		expect(Object.keys(runs).length).toBe(1)
		expect(runs["run-1"].status).toBe("succeeded")
	})

	// ============================================================
	// New high-value replays from added fixtures (concurrent+perm, q+tool, auto+error)
	// ============================================================

	test("replays concurrent+permissions fixture into full state and sidebar VM", () => {
		const jsonl = loadFixture("concurrent-permissions.jsonl")
		const events = loadEventFixture(jsonl)

		const state = replayEventsIntoReducer(events, initialFullCoreState, rootReducer)
		expect(Object.keys(state.sessions.sessions).length).toBe(2)
		expect(state.sessions.sessions["s-conc1"].status).toBe("idle")
		expect(state.sessions.sessions["s-conc2"].status).toBe("idle")
		expect(state.sessions.permissions["pr-conc1"]?.resolved?.response).toBe("allow")

		const sidebar = deriveSidebarViewModel(state)
		expect(sidebar.sessions.length).toBe(2)
		expect(sidebar.sessions.some((s) => s.id === "s-conc1")).toBe(true)
	})

	test("replays question+tool-mix fixture and derives chat VM with resolved q and tool", () => {
		const jsonl = loadFixture("question-tool-mix.jsonl")
		const events = loadEventFixture(jsonl)

		const state = replayEventsIntoReducer(events, initialFullCoreState, rootReducer)
		const chat = deriveChatViewModel(state, "s-mix")
		expect(chat).not.toBeNull()
		expect(chat!.pendingQuestions.length).toBe(0)
		expect(chat!.turns.length).toBe(2)
		// has tool part
		const parts = chat!.turns[1].parts
		expect(parts.some((p) => p.type === "tool-call")).toBe(true)
		expect(parts.some((p) => p.type === "tool-result")).toBe(true)
	})

	test("replays automation+error fixture and checks failed run + provider disconnect", () => {
		const jsonl = loadFixture("automation-error.jsonl")
		const events = loadEventFixture(jsonl)

		const state = replayEventsIntoReducer(events, initialFullCoreState, rootReducer)
		expect(state.automations.runs["run-err"].status).toBe("failed")
		expect(state.sessions.sessions["s-auto-err"].status).toBe("error")
		expect(state.provider.lastDisconnectReason).toBe("automation failed")
	})

	// ============================================================
	// Harness simulation + full rootReducer + view model derivation (pure, no e2e/electron)
	// ============================================================

	test("harness simulation produces events replayable via rootReducer to full state + VMs", () => {
		const harness = createHarness()
		harness.bus.record(true)
		harness.simulateSessionCreated({
			id: "s-hsim",
			workspaceId: "w-h",
			title: "Harness Sim",
			status: "busy",
		})
		harness.simulatePrompt("s-hsim", [
			{ id: "ph1", type: "text", delta: "Hel" },
			{ id: "ph1", type: "text", delta: "lo" },
			{ id: "ph2", type: "text", content: " world" },
		])
		harness.simulatePermissionRequest("s-hsim", { id: "pr-h", tool: "fs", description: "read?" })
		harness.replyToPermission("s-hsim", "pr-h", "allow")

		const recorded = harness.bus.getRecorded()
		expect(recorded.length).toBeGreaterThan(5)

		const state = replayEventsIntoReducer(recorded, initialFullCoreState, rootReducer)
		expect(state.sessions.sessions["s-hsim"]).toBeDefined()
		expect(state.sessions.sessions["s-hsim"].status).toBe("idle")

		const chat = deriveChatViewModel(state, "s-hsim")
		expect(chat).not.toBeNull()
		expect(chat!.turns.length).toBeGreaterThan(0)
		expect(chat!.pendingPermissions.length).toBe(0)

		const sidebar = deriveSidebarViewModel(state)
		expect(sidebar.sessions.some((s) => s.id === "s-hsim")).toBe(true)
	})

	test("harness concurrent + permission flow replays to correct state", () => {
		const harness = createHarness()
		harness.bus.record(true)
		const ids = harness.simulateConcurrentSessions(2, "w-conc-h")
		harness.simulatePermissionRequest(ids[0], { id: "pr-hc", tool: "bash" })
		harness.replyToPermission(ids[0], "pr-hc", { allow: false })

		const state = replayEventsIntoReducer(
			harness.bus.getRecorded(),
			initialFullCoreState,
			rootReducer,
		)
		expect(Object.keys(state.sessions.sessions).length).toBe(2)
		const perm = state.sessions.permissions["pr-hc"]
		expect(perm?.resolved?.response).toMatchObject({ allow: false })
	})
})
