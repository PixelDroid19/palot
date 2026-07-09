/**
 * Brand identity: shipping surfaces must say GCode, not legacy palot product marks.
 * Drives real files on disk (wordmark component, resources, about copy).
 */
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const root = join(import.meta.dir, "..")

describe("GCode brand identity", () => {
	test("inline wordmark component draws GCode text, not palot path outlines", () => {
		const src = readFileSync(join(root, "src/renderer/components/gcode-wordmark.tsx"), "utf8")
		expect(src).toContain("GCode")
		expect(src).not.toContain("M612.104")
		expect(src.toLowerCase()).not.toContain("palot.")
		expect(src).toMatch(/>\s*GCode\s*<\/text>/)
	})

	test("resources/wordmark.svg is GCode", () => {
		const svg = readFileSync(join(root, "resources/wordmark.svg"), "utf8")
		expect(svg).toContain("GCode")
		expect(svg.toLowerCase()).not.toMatch(/palot\./)
	})

	test("lockup PNGs exist and do not embed palot. ASCII", () => {
		for (const name of ["lockup-dark.png", "lockup-light.png"]) {
			const buf = readFileSync(join(root, "resources/brand", name))
			expect(buf.byteLength).toBeGreaterThan(1000)
			const lower = buf.toString("latin1").toLowerCase()
			expect(lower.includes("palot.")).toBe(false)
		}
	})

	test("about settings CLI labels use gcode", () => {
		const src = readFileSync(
			join(root, "src/renderer/components/settings/about-settings.tsx"),
			"utf8",
		)
		expect(src).toContain('label="gcode CLI"')
		expect(src).toContain("Install the gcode command-line tool")
		expect(src).not.toContain("palot CLI")
		expect(src).not.toContain("Install the palot")
	})

	test("onboarding installer logs use [gcode] prefix", () => {
		const src = readFileSync(join(root, "src/main/onboarding.ts"), "utf8")
		expect(src).toContain("[gcode]")
		expect(src).not.toContain("[palot]")
	})

	test("index.html FOUC reads gcode:colorScheme and splash is GCode", () => {
		const html = readFileSync(join(root, "src/renderer/index.html"), "utf8")
		expect(html).toContain("gcode:colorScheme")
		expect(html).toContain(">GCode</text>")
		expect(html).not.toContain("M612.104")
		// may still mention palot-preferences as legacy fallback only
		expect(html).toMatch(/gcode:colorScheme/)
	})

	test("electron-builder product identity is GCode", () => {
		const yml = readFileSync(join(root, "electron-builder.yml"), "utf8")
		expect(yml).toContain("productName: GCode")
		expect(yml).toContain("appId: com.gcode.desktop")
		expect(yml).not.toContain("productName: Palot")
		expect(yml).not.toContain("com.palot")
	})
})
