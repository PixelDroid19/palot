import { describe, expect, test } from "bun:test"
import { buildArgs } from "../src/main/codex-subagent"

describe("buildArgs", () => {
	test("defaults to a read-only sandbox and passes the prompt last", () => {
		const args = buildArgs({ prompt: "do a thing", cwd: "/repo" })
		expect(args).toEqual([
			"exec",
			"--json",
			"--skip-git-repo-check",
			"-s",
			"read-only",
			"-C",
			"/repo",
			"do a thing",
		])
	})

	test("honors an explicit sandbox", () => {
		const args = buildArgs({ prompt: "p", cwd: "/repo", sandbox: "workspace-write" })
		expect(args[args.indexOf("-s") + 1]).toBe("workspace-write")
	})

	test("includes a model override before the prompt", () => {
		const args = buildArgs({ prompt: "p", cwd: "/repo", model: "gpt-5-codex" })
		expect(args).toContain("-m")
		expect(args[args.indexOf("-m") + 1]).toBe("gpt-5-codex")
		expect(args[args.length - 1]).toBe("p")
	})

	test("always requests JSONL output and skips the git repo check", () => {
		const args = buildArgs({ prompt: "p", cwd: "/repo" })
		expect(args).toContain("--json")
		expect(args).toContain("--skip-git-repo-check")
	})
})
