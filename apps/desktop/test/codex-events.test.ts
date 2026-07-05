import { describe, expect, test } from "bun:test"
import { parseCodexLine, reduceCodexUpdates } from "../src/main/codex-events"

// Real lines captured from `codex exec --json` (v0.141.0).
const THREAD = '{"type":"thread.started","thread_id":"019f3033-2ae8-71f0-a126-716dec449fd6"}'
const TURN_STARTED = '{"type":"turn.started"}'
const NOTICE =
	'{"type":"item.completed","item":{"id":"item_0","type":"error","message":"Skill descriptions were shortened."}}'
const MESSAGE =
	'{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"pong"}}'
const USAGE =
	'{"type":"turn.completed","usage":{"input_tokens":20318,"cached_input_tokens":4992,"output_tokens":34,"reasoning_output_tokens":27}}'

describe("parseCodexLine", () => {
	test("parses the thread id", () => {
		expect(parseCodexLine(THREAD)).toEqual({
			kind: "thread",
			threadId: "019f3033-2ae8-71f0-a126-716dec449fd6",
		})
	})
	test("parses an agent message", () => {
		expect(parseCodexLine(MESSAGE)).toEqual({ kind: "message", text: "pong" })
	})
	test("maps an error item to a non-fatal notice", () => {
		expect(parseCodexLine(NOTICE)).toEqual({
			kind: "notice",
			text: "Skill descriptions were shortened.",
		})
	})
	test("parses usage from turn.completed", () => {
		expect(parseCodexLine(USAGE)).toEqual({
			kind: "usage",
			usage: {
				inputTokens: 20318,
				cachedInputTokens: 4992,
				outputTokens: 34,
				reasoningOutputTokens: 27,
			},
		})
	})
	test("surfaces unknown event types generically instead of dropping them", () => {
		expect(parseCodexLine(TURN_STARTED)?.kind).toBe("unknown")
	})
	test("ignores blank lines and invalid JSON", () => {
		expect(parseCodexLine("")).toBeNull()
		expect(parseCodexLine("   ")).toBeNull()
		expect(parseCodexLine("not json")).toBeNull()
	})
})

describe("reduceCodexUpdates", () => {
	test("folds a full run into a final result", () => {
		const updates = [THREAD, TURN_STARTED, NOTICE, MESSAGE, USAGE]
			.map(parseCodexLine)
			.filter((u) => u !== null)
		const result = reduceCodexUpdates(updates)
		expect(result.message).toBe("pong")
		expect(result.threadId).toBe("019f3033-2ae8-71f0-a126-716dec449fd6")
		expect(result.usage?.outputTokens).toBe(34)
		expect(result.notices).toHaveLength(1)
	})
	test("joins multiple agent messages with blank lines", () => {
		const updates = [
			{ kind: "message", text: "first" } as const,
			{ kind: "message", text: "second" } as const,
		]
		expect(reduceCodexUpdates(updates).message).toBe("first\n\nsecond")
	})
	test("empty stream yields an empty result", () => {
		expect(reduceCodexUpdates([])).toEqual({
			message: "",
			threadId: null,
			usage: null,
			notices: [],
		})
	})
})
