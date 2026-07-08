import { describe, expect, test } from "bun:test"
import { buildCodexProcessEnv } from "../src/providers/codex"

describe("buildCodexProcessEnv", () => {
	test("drops nested Codex session markers but keeps user config", () => {
		const env = buildCodexProcessEnv({
			CODEX_CI: "1",
			CODEX_INTERNAL_ORIGINATOR_OVERRIDE: "nested",
			CODEX_SHELL: "/bin/zsh",
			CODEX_THREAD_ID: "thread-123",
			CODEX_HOME: "/tmp/codex-home",
			PATH: "/usr/bin",
		})

		expect(env.CODEX_CI).toBeUndefined()
		expect(env.CODEX_INTERNAL_ORIGINATOR_OVERRIDE).toBeUndefined()
		expect(env.CODEX_SHELL).toBeUndefined()
		expect(env.CODEX_THREAD_ID).toBeUndefined()
		expect(env.CODEX_HOME).toBe("/tmp/codex-home")
		expect(env.PATH).toBe("/usr/bin")
	})
})
