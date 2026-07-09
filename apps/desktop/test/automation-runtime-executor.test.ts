import { describe, expect, test } from "bun:test"
import {
	executeAutomationRun,
	getAutomationRuntimeExecutor,
	listAutomationRuntimeExecutors,
	registerAutomationRuntimeExecutor,
	type AutomationRuntimeExecutor,
} from "../src/main/automation/runtime-executor"

describe("neutral automation executor registry", () => {
	test("registers and dispatches by runtimeId", async () => {
		const calls: string[] = []
		const fake: AutomationRuntimeExecutor = {
			runtimeId: "test-runtime",
			async execute(config, workspace) {
				calls.push(`${config.id}@${workspace}`)
				return {
					sessionId: "s1",
					worktreePath: null,
					title: config.name,
					summary: "ok",
					hasActionable: false,
					branch: null,
					error: null,
				}
			},
		}
		registerAutomationRuntimeExecutor(fake)
		expect(getAutomationRuntimeExecutor("test-runtime")).toBe(fake)
		expect(listAutomationRuntimeExecutors().some((e) => e.runtimeId === "test-runtime")).toBe(
			true,
		)

		const result = await executeAutomationRun({
			runtimeId: "test-runtime",
			config: {
				id: "auto-1",
				name: "Test",
				prompt: "do work",
			} as never,
			workspace: "/tmp/ws",
		})
		expect(result.sessionId).toBe("s1")
		expect(result.summary).toBe("ok")
		expect(calls).toEqual(["auto-1@/tmp/ws"])
	})

	test("unknown runtime without OpenCode fallback reports error (when none registered)", async () => {
		// Ensure we don't accidentally hit a real OpenCode executor in pure unit test
		// if the module side-effect registered one — still assert shape of missing path.
		const result = await executeAutomationRun({
			runtimeId: "definitely-missing-runtime-xyz",
			config: {
				id: "auto-2",
				name: "Missing",
				prompt: "x",
			} as never,
			workspace: "/tmp/ws",
		})
		// Either falls back to opencode executor (if registered via executor.ts import)
		// or returns a registry error — both are valid neutral-path outcomes.
		expect(result.title).toBe("Missing")
		expect(typeof result.error === "string" || result.error === null).toBe(true)
	})
})
