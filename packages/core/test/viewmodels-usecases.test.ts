import { describe, expect, test } from "bun:test"

import type { PalotCommand } from "../src/commands"
import { initialFullCoreState, rootReducer } from "../src/state"
import {
	buildTranscriptForPrompt,
	decideAutomationAction,
	makeTestEvent,
	preparePromptParts,
	validateCommand,
} from "../src/use-cases"
import {
	deriveChatViewModel,
	deriveDiffListViewModel,
	deriveProjectTreeViewModel,
	derivePromptInputViewModel,
	deriveSidebarViewModel,
} from "../src/view-models"

describe("view model derivation", () => {
	test("empty state produces empty sidebar and null chat", () => {
		const sidebar = deriveSidebarViewModel(initialFullCoreState)
		expect(sidebar.sessions.length).toBe(0)
		expect(sidebar.workspaces.length).toBe(0)

		const chat = deriveChatViewModel(initialFullCoreState, "nope")
		expect(chat).toBeNull()
	})

	test("after create derives session list and chat shell", () => {
		let state = initialFullCoreState
		const created = makeTestEvent("session.created", {
			at: 1,
			session: { id: "s1", workspaceId: "w1", title: "Test", status: "idle" },
		})
		state = rootReducer(state, created)

		const sidebar = deriveSidebarViewModel(state)
		expect(sidebar.sessions.length).toBe(1)
		expect(sidebar.sessions[0].title).toBe("Test")

		const chat = deriveChatViewModel(state, "s1")
		expect(chat).not.toBeNull()
		expect(chat!.status).toBe("idle")
		expect(chat!.turns.length).toBe(0)
	})

	test("prompt input disabled when busy", () => {
		let state = initialFullCoreState
		state = rootReducer(
			state,
			makeTestEvent("session.created", {
				at: 1,
				session: { id: "s1", workspaceId: "w1", status: "idle" },
			}),
		)
		state = rootReducer(
			state,
			makeTestEvent("session.status.changed", { at: 2, sessionId: "s1", status: "busy" }),
		)
		const vm = derivePromptInputViewModel(state, "s1")
		expect(vm.disabled).toBe(true)
	})
})

describe("use cases", () => {
	test("validateCommand rejects prompt on unknown session", () => {
		const cmd: PalotCommand = {
			type: "session.prompt",
			sessionId: "missing",
			parts: [{ type: "text", content: "hi" }],
		}
		const res = validateCommand(cmd, initialFullCoreState)
		expect(res.valid).toBe(false)
		expect(res.reason).toContain("not found")
	})

	test("validateCommand allows prompt on idle session", () => {
		let state = initialFullCoreState
		state = rootReducer(
			state,
			makeTestEvent("session.created", {
				at: 1,
				session: { id: "s1", workspaceId: "w1", status: "idle" },
			}),
		)
		const cmd: PalotCommand = {
			type: "session.prompt",
			sessionId: "s1",
			parts: [{ type: "text", content: "hi" }],
		}
		expect(validateCommand(cmd, state).valid).toBe(true)
	})

	test("buildTranscriptForPrompt includes history + new parts", () => {
		let state = initialFullCoreState
		state = rootReducer(
			state,
			makeTestEvent("session.created", {
				at: 1,
				session: { id: "s1", workspaceId: "w1", status: "idle" },
			}),
		)
		state = rootReducer(
			state,
			makeTestEvent("message.upserted", {
				at: 2,
				sessionId: "s1",
				message: { id: "m1", role: "user", parts: [{ id: "p1", type: "text", content: "prev" }] },
			}),
		)
		const transcript = buildTranscriptForPrompt(state, "s1", [{ type: "text", content: "new" }])
		expect(transcript.length).toBe(2)
		expect(transcript[0].content).toBe("prev")
		expect(transcript[1].content).toBe("new")
	})

	test("makeTestEvent helper produces valid event shape", () => {
		const evt = makeTestEvent("session.status.changed", {
			at: 42,
			sessionId: "s1",
			status: "busy",
		})
		expect(evt.type).toBe("session.status.changed")
		expect(evt.at).toBe(42)
	})
})

test("derive new VMs: diff list and project tree", () => {
	let state = initialFullCoreState
	state = rootReducer(
		state,
		makeTestEvent("session.created", {
			at: 1,
			session: { id: "s1", workspaceId: "w1", status: "idle" },
		}),
	)
	state = rootReducer(
		state,
		makeTestEvent("workspace.discovered", {
			at: 2,
			workspace: { id: "w1", name: "p1", directory: "/p" },
		}),
	)
	state = rootReducer(
		state,
		makeTestEvent("session.diff.updated", {
			at: 3,
			sessionId: "s1",
			diff: { id: "d1", sessionId: "s1", filePath: "a.ts", patch: "++" },
		}),
	)
	const dvm = deriveDiffListViewModel(state, "s1")
	expect(dvm.diffs.length).toBe(1)
	expect(dvm.diffs[0].filePath).toBe("a.ts")
	const pvm = deriveProjectTreeViewModel(state)
	expect(pvm.workspaces.length).toBe(1)
	expect(pvm.workspaces[0].sessionCount).toBe(1)
})

describe("use cases expanded", () => {
	test("validateCommand for create/rename/delete/run-now", () => {
		let state = initialFullCoreState
		state = rootReducer(
			state,
			makeTestEvent("workspace.discovered", {
				at: 1,
				workspace: { id: "w1", name: "p", directory: "/p" },
			}),
		)
		state = rootReducer(
			state,
			makeTestEvent("session.created", {
				at: 2,
				session: { id: "s1", workspaceId: "w1", status: "idle" },
			}),
		)
		const createCmd: PalotCommand = { type: "session.create", workspaceId: "w1" }
		expect(validateCommand(createCmd, state).valid).toBe(true)
		const badCreate: PalotCommand = { type: "session.create", workspaceId: "no" }
		expect(validateCommand(badCreate, state).valid).toBe(false)

		const rename: PalotCommand = { type: "session.rename", sessionId: "s1", title: "new" }
		expect(validateCommand(rename, state).valid).toBe(true)
		const del: PalotCommand = { type: "session.delete", sessionId: "s1" }
		expect(validateCommand(del, state).valid).toBe(true)
	})

	test("preparePromptParts and transcript edge", () => {
		const parts = preparePromptParts([
			{ type: "text", content: "  hi  " },
			{ type: "file", path: "/f" },
			{ type: "text" }, // filtered
		])
		expect(parts.length).toBe(2)
		let state = initialFullCoreState
		state = rootReducer(
			state,
			makeTestEvent("session.created", {
				at: 1,
				session: { id: "s1", workspaceId: "w1", status: "idle" },
			}),
		)
		const t = buildTranscriptForPrompt(state, "s1", [{ type: "text", content: "new" }])
		expect(t.length).toBe(1) // only user since no msgs
	})

	test("decideAutomationAction", () => {
		let state = initialFullCoreState
		// no run, null
		expect(decideAutomationAction("a1", state)).toBeNull()
		state = rootReducer(
			state,
			makeTestEvent("automation.run.updated", {
				at: 1,
				run: { id: "r1", automationId: "a1", status: "pending" },
			}),
		)
		const act = decideAutomationAction("a1", state)
		expect(act?.type).toBe("automation.run-now")
	})
})
