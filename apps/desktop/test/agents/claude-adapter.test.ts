import { describe, expect, test } from "bun:test"
import { claudeAdapter, parseClaudeLine } from "../../src/main/agents/claude-adapter"
import { reduceAgentUpdates } from "../../src/main/agents/types"

// Real result line captured from `claude -p --output-format json` (v2.1.201).
const RESULT =
	'{"type":"result","subtype":"success","is_error":false,"result":"pong","session_id":"1595c434-e86f-40ce-82d3-ad5897ab764a","usage":{"input_tokens":4849,"cache_read_input_tokens":0,"cache_creation_input_tokens":17250,"output_tokens":4}}'
const ERROR = '{"type":"result","is_error":true,"result":"Something went wrong"}'

describe("parseClaudeLine", () => {
	test("a single result line yields thread, message, and usage", () => {
		const updates = parseClaudeLine(RESULT)
		expect(updates).toContainEqual({
			kind: "thread",
			threadId: "1595c434-e86f-40ce-82d3-ad5897ab764a",
		})
		expect(updates).toContainEqual({ kind: "message", text: "pong" })
		expect(updates).toContainEqual({
			kind: "usage",
			usage: {
				inputTokens: 4849,
				cachedInputTokens: 0,
				outputTokens: 4,
				reasoningOutputTokens: 0,
			},
		})
	})

	test("maps an error result to a notice", () => {
		expect(parseClaudeLine(ERROR)).toEqual([{ kind: "notice", text: "Something went wrong" }])
	})

	test("ignores blank and invalid lines", () => {
		expect(parseClaudeLine("")).toEqual([])
		expect(parseClaudeLine("not json")).toEqual([])
	})

	test("folds the result line into a final answer with usage", () => {
		const result = reduceAgentUpdates(parseClaudeLine(RESULT))
		expect(result.message).toBe("pong")
		expect(result.threadId).toBe("1595c434-e86f-40ce-82d3-ad5897ab764a")
		expect(result.usage?.inputTokens).toBe(4849)
	})
})

describe("claudeAdapter.buildArgs", () => {
	test("uses print + json output with the prompt last", () => {
		expect(claudeAdapter.buildArgs({ prompt: "hello", cwd: "/repo" })).toEqual([
			"-p",
			"--output-format",
			"json",
			"hello",
		])
	})
	test("keeps read-only from loosening permissions", () => {
		const args = claudeAdapter.buildArgs({ prompt: "p", cwd: "/r", sandbox: "read-only" })
		expect(args).not.toContain("--dangerously-skip-permissions")
	})
	test("loosens permissions for write/full-access sandboxes", () => {
		const args = claudeAdapter.buildArgs({ prompt: "p", cwd: "/r", sandbox: "workspace-write" })
		expect(args).toContain("--dangerously-skip-permissions")
	})
	test("passes a model override", () => {
		const args = claudeAdapter.buildArgs({ prompt: "p", cwd: "/r", model: "claude-opus-4-8" })
		expect(args[args.indexOf("--model") + 1]).toBe("claude-opus-4-8")
	})

	test("resume passes --resume with the session id", () => {
		const args = claudeAdapter.buildArgs({ prompt: "next", cwd: "/r", resumeId: "sess-abc" })
		expect(args[args.indexOf("--resume") + 1]).toBe("sess-abc")
		expect(args).toContain("-p")
		expect(args[args.length - 1]).toBe("next")
	})
})
