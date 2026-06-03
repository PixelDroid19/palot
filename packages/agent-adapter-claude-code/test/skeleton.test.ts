import { describe, expect, test } from "bun:test"
import { ClaudeCodeAgentAdapter } from "../src"

describe("agent-adapter-claude-code (Phase 2 placeholder)", () => {
	test("constructs and has interface shape without runtime crash", () => {
		const a = new ClaudeCodeAgentAdapter()
		expect(a.id).toBe("claude-code")
		expect(a.label).toBe("Claude Code")
		expect(typeof a.connect).toBe("function")
		expect(typeof a.dispatch).toBe("function")
		expect(typeof a.events).toBe("function")
	})
})
