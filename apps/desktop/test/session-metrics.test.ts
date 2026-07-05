import { describe, expect, test } from "bun:test"
import type { Message } from "../src/renderer/lib/types"
import {
	computeCompactionThreshold,
	computeContextUsage,
	computeSessionCost,
	computeSessionTokens,
	formatCost,
	formatPercentage,
	formatTokens,
	formatWorkDuration,
	type ModelLimitInfo,
	shortModelName,
} from "../src/renderer/lib/session-metrics"

// Minimal assistant/user message shapes — only the fields the metrics read.
function assistant(cost: number, tokens?: Message["tokens"]): Message {
	return { role: "assistant", cost, tokens } as unknown as Message
}
function user(): Message {
	return { role: "user" } as unknown as Message
}

describe("computeSessionCost", () => {
	test("sums assistant costs and ignores user messages", () => {
		const msgs = [assistant(0.01), user(), assistant(0.02), assistant(0)]
		expect(computeSessionCost(msgs)).toBeCloseTo(0.03, 10)
	})
	test("treats missing cost as zero", () => {
		expect(computeSessionCost([assistant(undefined as unknown as number)])).toBe(0)
	})
	test("empty session costs nothing", () => {
		expect(computeSessionCost([])).toBe(0)
	})
})

describe("computeSessionTokens", () => {
	test("sums every token bucket across assistant messages", () => {
		const t1 = { input: 100, output: 50, reasoning: 10, cache: { read: 5, write: 3 } }
		const t2 = { input: 200, output: 20, reasoning: 0, cache: { read: 1, write: 0 } }
		const result = computeSessionTokens([
			assistant(0, t1 as Message["tokens"]),
			user(),
			assistant(0, t2 as Message["tokens"]),
		])
		expect(result.input).toBe(300)
		expect(result.output).toBe(70)
		expect(result.reasoning).toBe(10)
		expect(result.cacheRead).toBe(6)
		expect(result.cacheWrite).toBe(3)
		expect(result.total).toBe(300 + 70 + 10 + 6 + 3)
	})
	test("skips assistant messages without token data", () => {
		const result = computeSessionTokens([assistant(0, undefined)])
		expect(result.total).toBe(0)
	})
})

describe("formatCost", () => {
	test("rounds sub-cent costs to $0.00", () => {
		expect(formatCost(0)).toBe("$0.00")
		expect(formatCost(0.004)).toBe("$0.00")
	})
	test("formats larger costs to two decimals", () => {
		expect(formatCost(0.01)).toBe("$0.01")
		expect(formatCost(12.3)).toBe("$12.30")
	})
})

describe("formatTokens", () => {
	test("plain integers below 1000", () => {
		expect(formatTokens(0)).toBe("0")
		expect(formatTokens(999)).toBe("999")
	})
	test("thousands with one decimal below 10k, rounded above", () => {
		expect(formatTokens(1200)).toBe("1.2k")
		expect(formatTokens(45300)).toBe("45k")
	})
	test("millions", () => {
		expect(formatTokens(1_200_000)).toBe("1.2M")
		expect(formatTokens(12_000_000)).toBe("12M")
	})
})

describe("formatPercentage", () => {
	test("clamps the extremes", () => {
		expect(formatPercentage(0.2)).toBe("0%")
		expect(formatPercentage(99.9)).toBe("100%")
	})
	test("one decimal below 10, rounded above", () => {
		expect(formatPercentage(4.25)).toBe("4.3%")
		expect(formatPercentage(42.4)).toBe("42%")
	})
})

describe("shortModelName", () => {
	test("shortens Claude, GPT and Gemini ids", () => {
		expect(shortModelName("claude-sonnet-4-20250514")).toBe("sonnet-4")
		expect(shortModelName("gpt-4o-2024-08-06")).toBe("gpt-4o")
	})
	test("returns the id unchanged when no pattern matches", () => {
		expect(shortModelName("o3-mini")).toBe("o3-mini")
		expect(shortModelName("")).toBe("")
	})
})

describe("computeCompactionThreshold", () => {
	test("uses input limit minus the reserved buffer when input is known", () => {
		// maxOutput = min(8000, 32000) = 8000; reserved = min(20000, 8000) = 8000
		expect(computeCompactionThreshold({ context: 200_000, input: 200_000, output: 8_000 })).toBe(
			192_000,
		)
	})
	test("falls back to context minus max output when there is no input limit", () => {
		expect(computeCompactionThreshold({ context: 128_000, output: 4_096 })).toBe(123_904)
	})
	test("honors an explicit reserved override", () => {
		expect(
			computeCompactionThreshold({ context: 200_000, input: 200_000, output: 8_000 }, 20_000),
		).toBe(180_000)
	})
	test("treats a zero output limit as the 32k default", () => {
		// maxOutput = min(0,32000) || 32000 = 32000; reserved = min(20000,32000) = 20000
		expect(computeCompactionThreshold({ context: 200_000, input: 200_000, output: 0 })).toBe(
			180_000,
		)
	})
})

describe("computeContextUsage", () => {
	const limit: ModelLimitInfo = { context: 200_000, input: 200_000, output: 8_000 }
	const getLimit = () => limit

	test("reads the last assistant message with tokens", () => {
		const msgs = [
			user(),
			assistant(0, { input: 1_000, output: 500 } as Message["tokens"]),
		]
		// tag providerID/modelID the function reads
		;(msgs[1] as unknown as { providerID: string; modelID: string }).providerID = "anthropic"
		;(msgs[1] as unknown as { providerID: string; modelID: string }).modelID = "claude"
		const usage = computeContextUsage(msgs, getLimit)
		expect(usage?.lastMessageTokens).toBe(1_500)
		expect(usage?.contextLimit).toBe(200_000)
		expect(usage?.compactionThreshold).toBe(192_000)
	})

	test("returns null when no assistant message has tokens", () => {
		expect(computeContextUsage([user()], getLimit)).toBeNull()
	})

	test("returns null when the model limit is unknown", () => {
		const msgs = [assistant(0, { input: 10 } as Message["tokens"])]
		expect(computeContextUsage(msgs, () => undefined)).toBeNull()
	})

	test("omits the compaction threshold when auto-compaction is disabled", () => {
		const msgs = [assistant(0, { input: 1_000 } as Message["tokens"])]
		const usage = computeContextUsage(msgs, getLimit, { auto: false })
		expect(usage?.compactionThreshold).toBeNull()
		expect(usage?.compactionPercentage).toBeNull()
	})
})

describe("formatWorkDuration", () => {
	test("formats sub-second, seconds, minutes, and hours", () => {
		expect(formatWorkDuration(500)).toBe("0s")
		expect(formatWorkDuration(5_000)).toBe("5s")
		expect(formatWorkDuration(60_000)).toBe("1m")
		expect(formatWorkDuration(65_000)).toBe("1m 5s")
		expect(formatWorkDuration(3_600_000)).toBe("1h")
		expect(formatWorkDuration(3_660_000)).toBe("1h 1m")
	})
})
