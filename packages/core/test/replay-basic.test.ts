import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { loadEventFixture } from "@palot/events"
import { initialCoreState, sessionLifecycleReducer } from "../src/sessions"

describe("event replay into core", () => {
	test("replays basic session fixture and produces expected state", () => {
		const jsonl = readFileSync(
			join(import.meta.dir, "../../events/fixtures/opencode-session-basic.jsonl"),
			"utf8",
		)
		const events = loadEventFixture(jsonl)

		let state = initialCoreState
		for (const env of events) {
			if (env.event.type.startsWith("session.")) {
				state = sessionLifecycleReducer(state, env.event)
			}
		}

		const sess = state.sessions["s-basic"]
		expect(sess).toBeDefined()
		expect(sess.title).toBe("Basic Session")
		expect(sess.status).toBe("idle")
	})
})
