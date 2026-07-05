import { describe, expect, test } from "bun:test"
import { codexAdapter, parseCodexLine } from "../../src/main/agents/codex-adapter"
import { reduceAgentUpdates } from "../../src/main/agents/types"

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
	test("parses thread, message, notice, and usage", () => {
		expect(parseCodexLine(THREAD)).toEqual([
			{ kind: "thread", threadId: "019f3033-2ae8-71f0-a126-716dec449fd6" },
		])
		expect(parseCodexLine(MESSAGE)).toEqual([{ kind: "message", text: "pong" }])
		expect(parseCodexLine(NOTICE)).toEqual([
			{ kind: "notice", text: "Skill descriptions were shortened." },
		])
		expect(parseCodexLine(USAGE)).toEqual([
			{
				kind: "usage",
				usage: {
					inputTokens: 20318,
					cachedInputTokens: 4992,
					outputTokens: 34,
					reasoningOutputTokens: 27,
				},
			},
		])
	})
	test("surfaces unknown events and ignores junk", () => {
		expect(parseCodexLine(TURN_STARTED)[0]?.kind).toBe("unknown")
		expect(parseCodexLine("")).toEqual([])
		expect(parseCodexLine("not json")).toEqual([])
	})
	test("folds a full run into the final result", () => {
		const updates = [THREAD, TURN_STARTED, NOTICE, MESSAGE, USAGE].flatMap(parseCodexLine)
		const result = reduceAgentUpdates(updates)
		expect(result.message).toBe("pong")
		expect(result.threadId).toBe("019f3033-2ae8-71f0-a126-716dec449fd6")
		expect(result.usage?.outputTokens).toBe(34)
		expect(result.notices).toHaveLength(1)
	})
})

describe("codexAdapter.buildArgs", () => {
	test("defaults to a read-only sandbox with the prompt last", () => {
		expect(codexAdapter.buildArgs({ prompt: "do it", cwd: "/repo" })).toEqual([
			"exec",
			"--json",
			"--skip-git-repo-check",
			"-s",
			"read-only",
			"-C",
			"/repo",
			"do it",
		])
	})
	test("passes sandbox and model overrides", () => {
		const args = codexAdapter.buildArgs({
			prompt: "p",
			cwd: "/r",
			sandbox: "workspace-write",
			model: "gpt-5-codex",
		})
		expect(args[args.indexOf("-s") + 1]).toBe("workspace-write")
		expect(args[args.indexOf("-m") + 1]).toBe("gpt-5-codex")
		expect(args[args.length - 1]).toBe("p")
	})
})
