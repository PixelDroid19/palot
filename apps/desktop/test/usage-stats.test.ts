/**
 * Public usage-stats helpers (pure) — no private functions.
 */
import { describe, expect, test } from "bun:test"
import {
	computeSessionCost,
	computeSessionTokens,
	formatCost,
	formatTokens,
} from "../src/renderer/services/usage-stats"

describe("usage-stats public helpers", () => {
	test("computeSessionCost sums assistant costs only", () => {
		const cost = computeSessionCost([
			{ role: "user" },
			{ role: "assistant", cost: 0.12 },
			{ role: "assistant", cost: 0.03 },
		])
		expect(cost).toBeCloseTo(0.15)
	})

	test("computeSessionTokens aggregates token fields", () => {
		const t = computeSessionTokens([
			{
				role: "assistant",
				tokens: {
					input: 100,
					output: 50,
					reasoning: 10,
					cache: { read: 20, write: 5 },
				},
			},
			{ role: "user", tokens: { input: 999, output: 999 } },
		])
		expect(t.input).toBe(100)
		expect(t.output).toBe(50)
		expect(t.reasoning).toBe(10)
		expect(t.cacheRead).toBe(20)
		expect(t.cacheWrite).toBe(5)
		expect(t.total).toBe(185)
	})

	test("formatCost and formatTokens", () => {
		expect(formatCost(0)).toBe("$0.00")
		expect(formatCost(1.5)).toBe("$1.50")
		expect(formatTokens(500)).toBe("500")
		expect(formatTokens(1500)).toBe("1.5k")
	})
})
