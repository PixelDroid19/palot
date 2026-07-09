import { describe, expect, test } from "bun:test"
import {
	iconAnimationClassName,
	iconAnimationIsActive,
	resolveRegisteredIconKey,
	runtimeIdToIconKey,
	sessionStatusToIconAnimation,
} from "../src/renderer/lib/runtime-icons"

describe("runtimeIdToIconKey", () => {
	test("maps primary runtimes to stable public keys", () => {
		expect(runtimeIdToIconKey("opencode")).toBe("opencode")
		expect(runtimeIdToIconKey("codex")).toBe("codex")
		expect(runtimeIdToIconKey("claude")).toBe("claude")
	})

	test("unknown / empty → fallback", () => {
		expect(runtimeIdToIconKey("custom-harness")).toBe("fallback")
		expect(runtimeIdToIconKey("")).toBe("fallback")
		expect(runtimeIdToIconKey(null)).toBe("fallback")
		expect(runtimeIdToIconKey(undefined)).toBe("fallback")
	})

	test("is case-insensitive", () => {
		expect(runtimeIdToIconKey("Claude")).toBe("claude")
		expect(runtimeIdToIconKey("CODEX")).toBe("codex")
	})

	test("extra registry overrides without product layout forks", () => {
		expect(resolveRegisteredIconKey("acme", { acme: "codex" })).toBe("codex")
		expect(resolveRegisteredIconKey("acme")).toBe("fallback")
	})
})

describe("sessionStatusToIconAnimation", () => {
	test("busy/running animates", () => {
		expect(sessionStatusToIconAnimation("running")).toBe("busy")
		expect(iconAnimationIsActive("busy")).toBe(true)
		expect(iconAnimationClassName("busy")).toContain("animate")
	})

	test("waiting pulses (not idle)", () => {
		expect(sessionStatusToIconAnimation("waiting")).toBe("waiting")
		expect(iconAnimationIsActive("waiting")).toBe(true)
		expect(iconAnimationClassName("waiting")).toContain("animate")
	})

	test("idle/completed do not animate", () => {
		expect(sessionStatusToIconAnimation("idle")).toBe("idle")
		expect(sessionStatusToIconAnimation("completed")).toBe("idle")
		expect(sessionStatusToIconAnimation("paused")).toBe("idle")
		expect(iconAnimationIsActive("idle")).toBe(false)
		expect(iconAnimationClassName("idle")).toBe("")
	})

	test("failed is distinct static emphasis", () => {
		expect(sessionStatusToIconAnimation("failed")).toBe("failed")
		expect(iconAnimationIsActive("failed")).toBe(false)
	})
})
