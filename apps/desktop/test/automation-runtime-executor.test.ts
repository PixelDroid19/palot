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

	test("explicit unknown runtimeId fails closed (never silently runs another backend)", async () => {
		// Register a decoy OpenCode executor — must NOT be used for an explicit other id.
		registerAutomationRuntimeExecutor({
			runtimeId: "opencode",
			async execute(config) {
				return {
					sessionId: "should-not-run",
					worktreePath: null,
					title: config.name,
					summary: "opencode-ran",
					hasActionable: false,
					branch: null,
					error: null,
				}
			},
		})
		const result = await executeAutomationRun({
			runtimeId: "definitely-missing-runtime-xyz",
			config: {
				id: "auto-2",
				name: "Missing",
				prompt: "x",
			} as never,
			workspace: "/tmp/ws",
		})
		expect(result.title).toBe("Missing")
		expect(result.sessionId).toBe("")
		expect(result.error).toContain("definitely-missing-runtime-xyz")
		expect(result.summary).not.toBe("opencode-ran")
	})

	test("omitted runtimeId defaults to opencode executor when registered", async () => {
		registerAutomationRuntimeExecutor({
			runtimeId: "opencode",
			async execute(config) {
				return {
					sessionId: "oc-default",
					worktreePath: null,
					title: config.name,
					summary: "default-opencode",
					hasActionable: false,
					branch: null,
					error: null,
				}
			},
		})
		const result = await executeAutomationRun({
			runtimeId: "",
			config: {
				id: "auto-legacy",
				name: "Legacy",
				prompt: "x",
			} as never,
			workspace: "/tmp/ws",
		})
		expect(result.sessionId).toBe("oc-default")
		expect(result.summary).toBe("default-opencode")
	})

	test("dispatches to registered runtimeId (config.runtimeId path is product-owned)", async () => {
		const seen: string[] = []
		registerAutomationRuntimeExecutor({
			runtimeId: "claude-auto-test",
			async execute(config) {
				seen.push(config.id)
				return {
					sessionId: "c1",
					worktreePath: null,
					title: config.name,
					summary: "claude-path",
					hasActionable: true,
					branch: null,
					error: null,
				}
			},
		})
		const result = await executeAutomationRun({
			runtimeId: "claude-auto-test",
			config: {
				id: "auto-claude",
				name: "Claude Auto",
				prompt: "review",
				runtimeId: "claude-auto-test",
			} as never,
			workspace: "/tmp/ws",
		})
		expect(result.summary).toBe("claude-path")
		expect(seen).toEqual(["auto-claude"])
	})
})
