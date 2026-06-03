import { describe, expect, test } from "bun:test"
import { CodexAgentAdapter } from "../src"

describe("agent-adapter-codex (Phase 2 placeholder)", () => {
	test("constructs and has interface shape without runtime crash", () => {
		const a = new CodexAgentAdapter()
		expect(a.id).toBe("codex")
		expect(a.label).toBe("Codex")
		expect(typeof a.connect).toBe("function")
		expect(typeof a.dispatch).toBe("function")
		expect(typeof a.events).toBe("function")
	})
})
