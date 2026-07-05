import { describe, expect, test } from "bun:test"
import { claudeAdapter, parseClaudeLine } from "../src/adapters/claude"
import { codexAdapter, parseCodexLine } from "../src/adapters/codex"
import { reduceAgentUpdates } from "../src/types"

describe("claude adapter", () => {
	test("parses the stream-json init event into a thread id", () => {
		const updates = parseClaudeLine(
			JSON.stringify({ type: "system", subtype: "init", session_id: "sess-1" }),
		)
		expect(updates).toEqual([{ kind: "thread", threadId: "sess-1" }])
	})

	test("streams assistant text blocks as deltas and tool use as tools", () => {
		const updates = parseClaudeLine(
			JSON.stringify({
				type: "assistant",
				message: {
					content: [
						{ type: "text", text: "Working on it" },
						{ type: "tool_use", name: "Bash", input: {} },
					],
				},
			}),
		)
		expect(updates).toEqual([
			{ kind: "message-delta", text: "Working on it" },
			{ kind: "tool", name: "Bash" },
		])
	})

	test("result line carries answer, thread and usage", () => {
		const updates = parseClaudeLine(
			JSON.stringify({
				type: "result",
				subtype: "success",
				is_error: false,
				result: "Done.",
				session_id: "sess-1",
				usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 3 },
			}),
		)
		const result = reduceAgentUpdates(updates)
		expect(result.message).toBe("Done.")
		expect(result.threadId).toBe("sess-1")
		expect(result.usage).toEqual({
			inputTokens: 10,
			cachedInputTokens: 3,
			outputTokens: 5,
			reasoningOutputTokens: 0,
		})
	})

	test("error result becomes a notice, not a message", () => {
		const updates = parseClaudeLine(
			JSON.stringify({ type: "result", is_error: true, result: "boom" }),
		)
		expect(updates).toEqual([{ kind: "notice", text: "boom" }])
	})

	test("non-JSON and blank lines are ignored", () => {
		expect(parseClaudeLine("")).toEqual([])
		expect(parseClaudeLine("plain text")).toEqual([])
	})

	test("buildCommand streams, sends prompt on stdin, and resumes", () => {
		const { args, stdin } = claudeAdapter.buildCommand({
			prompt: "do the thing",
			cwd: "/tmp",
			resumeId: "sess-1",
			model: "opus",
			sandbox: "workspace-write",
		})
		expect(stdin).toBe("do the thing")
		expect(args).toContain("stream-json")
		expect(args).toContain("--resume")
		expect(args).toContain("--dangerously-skip-permissions")
		expect(args).not.toContain("do the thing")
	})

	test("buildCommand injects the bridge as an MCP server", () => {
		const { args } = claudeAdapter.buildCommand({
			prompt: "x",
			cwd: "/tmp",
			bridge: {
				url: "http://127.0.0.1:9999",
				token: "tok",
				proxyScriptPath: "/p/proxy.cjs",
				nodeBinary: "/usr/bin/node",
			},
		})
		const idx = args.indexOf("--mcp-config")
		expect(idx).toBeGreaterThan(-1)
		const config = JSON.parse(args[idx + 1] ?? "{}")
		expect(config.mcpServers.palot.command).toBe("/usr/bin/node")
		expect(config.mcpServers.palot.env.PALOT_BRIDGE_TOKEN).toBe("tok")
	})
})

describe("codex adapter", () => {
	test("parses thread, message, reasoning, command and usage events", () => {
		const lines = [
			{ type: "thread.started", thread_id: "t-1" },
			{ type: "item.completed", item: { type: "reasoning", text: "hmm" } },
			{ type: "item.completed", item: { type: "command_execution", command: "ls" } },
			{ type: "item.completed", item: { type: "agent_message", text: "answer" } },
			{ type: "turn.completed", usage: { input_tokens: 7, output_tokens: 2 } },
		]
		const updates = lines.flatMap((l) => parseCodexLine(JSON.stringify(l)))
		const result = reduceAgentUpdates(updates)
		expect(result.threadId).toBe("t-1")
		expect(result.message).toBe("answer")
		expect(updates).toContainEqual({ kind: "tool", name: "shell", detail: "ls" })
		expect(result.usage?.inputTokens).toBe(7)
	})

	test("buildCommand sends prompt on stdin via '-'", () => {
		const { args, stdin } = codexAdapter.buildCommand({
			prompt: "task",
			cwd: "/work",
			sandbox: "read-only",
			reasoningEffort: "high",
		})
		expect(stdin).toBe("task")
		expect(args[args.length - 1]).toBe("-")
		expect(args).toContain('model_reasoning_effort="high"')
		expect(args).toContain("/work")
	})

	test("buildCommand attaches images with -i", () => {
		const { args } = codexAdapter.buildCommand({
			prompt: "describe these",
			cwd: "/w",
			images: ["/tmp/a.png", "/tmp/b.jpg"],
		})
		expect(args).toContain("-i")
		expect(args).toContain("/tmp/a.png")
		expect(args).toContain("/tmp/b.jpg")
	})

	test("buildCommand resume keeps model overrides", () => {
		const { args } = codexAdapter.buildCommand({
			prompt: "task",
			cwd: "/work",
			resumeId: "t-1",
			model: "gpt-5.5",
		})
		expect(args).toContain("resume")
		expect(args).toContain('model="gpt-5.5"')
	})

	test("sandboxed runs get no bridge (codex cancels MCP calls headlessly)", () => {
		const bridge = {
			url: "http://127.0.0.1:1",
			token: "tok",
			proxyScriptPath: "/p.cjs",
			nodeBinary: "node",
		}
		const sandboxed = codexAdapter.buildCommand({ prompt: "x", cwd: "/w", bridge })
		expect(sandboxed.args.some((a) => a.includes("mcp_servers"))).toBe(false)
		expect(sandboxed.args).toContain("read-only")

		const full = codexAdapter.buildCommand({
			prompt: "x",
			cwd: "/w",
			sandbox: "danger-full-access",
			bridge,
		})
		expect(full.args).toContain("--dangerously-bypass-approvals-and-sandbox")
		expect(full.args.some((a) => a.startsWith("mcp_servers.palot.command="))).toBe(true)
	})
})
