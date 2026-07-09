import { describe, expect, test } from "bun:test"
import {
	AUTONOMY_MODES,
	autonomyModeToSandbox,
	cycleAutonomyMode,
	isConfirmBeforeWriteMode,
	isPlanFirstMode,
	listAutonomyModes,
	sandboxToAutonomyMode,
} from "../src/renderer/lib/autonomy-modes"

describe("autonomy modes (execution ladder)", () => {
	test("exposes at least three modes including plan-first and confirm-before-write", () => {
		const modes = listAutonomyModes()
		expect(modes.length).toBeGreaterThanOrEqual(3)
		expect(modes.some((m) => m.policy === "plan-first")).toBe(true)
		expect(modes.some((m) => m.policy === "confirm-before-write")).toBe(true)
		expect(isPlanFirstMode("plan")).toBe(true)
		expect(isConfirmBeforeWriteMode("confirm")).toBe(true)
	})

	test("maps product modes to AgentSandbox wire values", () => {
		expect(autonomyModeToSandbox("plan")).toBe("plan")
		expect(autonomyModeToSandbox("confirm")).toBe("read-only")
		expect(autonomyModeToSandbox("auto-edit")).toBe("workspace-write")
		expect(autonomyModeToSandbox("full-access")).toBe("danger-full-access")
	})

	test("round-trips sandbox → mode", () => {
		for (const mode of AUTONOMY_MODES) {
			expect(sandboxToAutonomyMode(mode.sandbox)).toBe(mode.id)
		}
	})

	test("cycleAutonomyMode walks the ladder", () => {
		expect(cycleAutonomyMode("plan")).toBe("confirm")
		expect(cycleAutonomyMode("full-access")).toBe("plan")
	})
})
