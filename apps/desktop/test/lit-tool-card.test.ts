/**
 * Public tool-category helpers + Lit tool-card production path.
 */
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"
import {
	getToolCategory,
	isToolCardError,
	isToolCardRunning,
} from "../src/renderer/lit/tool-category"

describe("tool-category public helpers", () => {
	test("maps tool names to categories", () => {
		expect(getToolCategory("bash")).toBe("run")
		expect(getToolCategory("read")).toBe("explore")
		expect(getToolCategory("edit")).toBe("edit")
		expect(getToolCategory("unknown-xyz")).toBe("other")
	})

	test("status helpers", () => {
		expect(isToolCardRunning("running")).toBe(true)
		expect(isToolCardRunning("pending")).toBe(true)
		expect(isToolCardRunning("completed")).toBe(false)
		expect(isToolCardError("error")).toBe(true)
		expect(isToolCardError("completed")).toBe(false)
	})

	test("Lit element is quiet chrome (no neon category borders)", () => {
		const scss = readFileSync(
			path.resolve(
				import.meta.dir,
				"../src/renderer/lit/components/gcode-tool-card.scss",
			),
			"utf8",
		)
		expect(scss).toContain("border:")
		expect(scss).not.toMatch(/border-l:\s*2px/)
		expect(scss).not.toContain("blue-500")
	})

	test("Lit tool card avoids terminal-library chrome", () => {
		const src = readFileSync(
			path.resolve(import.meta.dir, "../src/renderer/lit/components/gcode-tool-card.ts"),
			"utf8",
		)
		expect(src).toContain('@customElement("gcode-tool-card")')
		expect(src).not.toContain("@gcode/ui")
		expect(src).not.toContain("Terminal")
	})
})
