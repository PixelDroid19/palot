/**
 * Public status-dot helpers + Lit production path for ServerIndicator leaf.
 */
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"
import {
	healthToStatusDotKind,
	statusDotKindLabel,
} from "../src/renderer/lit/status-dot"

describe("status-dot public helpers", () => {
	test("maps health boolean|null to stable kinds", () => {
		expect(healthToStatusDotKind(null)).toBe("checking")
		expect(healthToStatusDotKind(true)).toBe("ok")
		expect(healthToStatusDotKind(false)).toBe("bad")
	})

	test("labels are human-readable", () => {
		expect(statusDotKindLabel("checking")).toMatch(/check/i)
		expect(statusDotKindLabel("ok")).toMatch(/online/i)
		expect(statusDotKindLabel("bad")).toMatch(/offline/i)
	})

	test("ServerIndicator uses Lit host only (no dual span markup for dots)", () => {
		const src = readFileSync(
			path.resolve(import.meta.dir, "../src/renderer/components/server-indicator.tsx"),
			"utf8",
		)
		expect(src).toContain("gcode-status-dot")
		expect(src).toContain("../lit/components/gcode-status-dot")
		expect(src).not.toContain("bg-green-500")
		expect(src).not.toContain("bg-red-500")
		expect(src).not.toContain("animate-pulse")
	})

	test("Lit element is registered custom element", () => {
		const lit = readFileSync(
			path.resolve(import.meta.dir, "../src/renderer/lit/components/gcode-status-dot.ts"),
			"utf8",
		)
		expect(lit).toContain('@customElement("gcode-status-dot")')
		expect(lit).toContain("healthToStatusDotKind")
	})
})
