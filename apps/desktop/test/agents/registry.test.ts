import { describe, expect, test } from "bun:test"
import { AGENT_ADAPTERS, getAgentAdapter } from "../../src/main/agents/registry"

describe("agent adapter registry", () => {
	test("registers Codex and Claude Code", () => {
		expect(AGENT_ADAPTERS.map((a) => a.id).sort()).toEqual(["claude", "codex"])
	})
	test("every adapter is well-formed", () => {
		for (const a of AGENT_ADAPTERS) {
			expect(a.binary.trim().length).toBeGreaterThan(0)
			expect(a.displayName.trim().length).toBeGreaterThan(0)
			expect(typeof a.buildArgs).toBe("function")
			expect(typeof a.parseLine).toBe("function")
			// parseLine must tolerate junk without throwing.
			expect(a.parseLine("not json")).toEqual([])
		}
	})
	test("getAgentAdapter resolves ids and returns undefined otherwise", () => {
		expect(getAgentAdapter("codex")?.displayName).toBe("Codex")
		// @ts-expect-error -- invalid id exercises the not-found path
		expect(getAgentAdapter("nope")).toBeUndefined()
	})
})
