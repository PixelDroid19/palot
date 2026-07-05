import { describe, expect, test } from "bun:test"
import { ADAPTERS, getAdapter } from "../src/adapters/index"

/**
 * Integrity checks for the adapter registry. These guard against mistakes when
 * adding or editing an adapter — a duplicate id, an empty binary list, or a
 * malformed docs URL would otherwise slip through unnoticed.
 */
describe("adapter registry integrity", () => {
	test("has at least the known adapters", () => {
		expect(ADAPTERS.length).toBeGreaterThanOrEqual(5)
	})

	test("every adapter id is unique", () => {
		const ids = ADAPTERS.map((a) => a.id)
		expect(new Set(ids).size).toBe(ids.length)
	})

	test("every adapter is well-formed", () => {
		for (const a of ADAPTERS) {
			expect(a.displayName.trim().length).toBeGreaterThan(0)
			expect(a.binaries.length).toBeGreaterThan(0)
			expect(a.binaries.every((b) => b.trim().length > 0)).toBe(true)
			expect(a.versionArgs.length).toBeGreaterThan(0)
			expect(a.installHint.trim().length).toBeGreaterThan(0)
			expect(a.docsUrl).toMatch(/^https:\/\//)
			// Auth paths, when declared, must be non-empty strings.
			for (const p of a.authPaths ?? []) {
				expect(p.trim().length).toBeGreaterThan(0)
			}
		}
	})

	test("exactly one adapter is the managed backend (OpenCode)", () => {
		const managed = ADAPTERS.filter((a) => a.managed)
		expect(managed).toHaveLength(1)
		expect(managed[0].id).toBe("opencode")
	})

	test("getAdapter resolves known ids and returns undefined otherwise", () => {
		expect(getAdapter("claude")?.displayName).toBe("Claude Code")
		// @ts-expect-error -- exercising the not-found path with an invalid id
		expect(getAdapter("nonexistent")).toBeUndefined()
	})
})
