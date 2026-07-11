/**
 * Public wordmark helpers + custom element registration (shipped path).
 */
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"
import {
	WORDMARK_FONT_FAMILY,
	WORDMARK_LABEL,
	WORDMARK_VIEWBOX,
} from "../src/renderer/lit/wordmark"

describe("GCode wordmark (public)", () => {
	test("label and viewBox match product brand constants", () => {
		expect(WORDMARK_LABEL).toBe("GCode")
		expect(WORDMARK_VIEWBOX).toBe("0 0 120 28")
		expect(WORDMARK_FONT_FAMILY).toContain("monospace")
		expect(WORDMARK_LABEL).not.toMatch(/palot/i)
	})

	test("Lit element renders WORDMARK_LABEL via public constants", () => {
		const lit = readFileSync(
			path.resolve(import.meta.dir, "../src/renderer/lit/components/gcode-wordmark.ts"),
			"utf8",
		)
		expect(lit).toContain("WORDMARK_LABEL")
		expect(lit).toContain("WORDMARK_VIEWBOX")
		expect(lit).toContain('@customElement("gcode-wordmark")')
	})

	test("renderer registers the Lit wordmark in the product shell", () => {
		const reg = readFileSync(
			path.resolve(import.meta.dir, "../src/renderer/lit/register.ts"),
			"utf8",
		)
		const main = readFileSync(
			path.resolve(import.meta.dir, "../src/renderer/main.tsx"),
			"utf8",
		)
		expect(reg).toContain("./components/gcode-wordmark")
		expect(main).toContain("./lit/register")
		expect(main).toContain("./lit/main-lit")
		expect(main).not.toContain("react")
	})
})
