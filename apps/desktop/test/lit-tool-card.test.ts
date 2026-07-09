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

	test("React ToolCard hosts Lit only (no dual Collapsible chrome)", () => {
		const host = readFileSync(
			path.resolve(import.meta.dir, "../src/renderer/components/chat/tool-card.tsx"),
			"utf8",
		)
		expect(host).toContain("gcode-tool-card")
		expect(host).toContain("../../lit/components/gcode-tool-card")
		expect(host).not.toContain("Collapsible")
		expect(host).not.toContain("border-l-blue")
		expect(host).not.toContain("border-l-2")
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

	test("Bash content avoids Terminal ai-element chrome", () => {
		const src = readFileSync(
			path.resolve(import.meta.dir, "../src/renderer/components/chat/chat-tool-call.tsx"),
			"utf8",
		)
		expect(src).toContain("tool-bash-body")
		expect(src).not.toContain('from "@gcode/ui/components/ai-elements/terminal"')
		expect(src).not.toContain("<Terminal")
	})
})
