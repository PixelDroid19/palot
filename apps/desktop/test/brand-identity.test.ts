/**
 * Brand identity for Lit-only desktop product surfaces.
 */
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const root = join(import.meta.dir, "..")

describe("GCode brand identity", () => {
	test("Lit shell brand text is GCode", () => {
		const src = readFileSync(
			join(root, "src/renderer/lit/components/gcode-sidebar.ts"),
			"utf8",
		)
		expect(src).toContain("GCode")
		expect(src).not.toMatch(/\bPalot\b/)
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

	test("onboarding installer logs use [gcode] prefix", () => {
		const src = readFileSync(join(root, "src/main/onboarding.ts"), "utf8")
		expect(src).toContain("[gcode]")
		expect(src).not.toContain("[palot]")
	})

	test("index.html splash is GCode", () => {
		const html = readFileSync(join(root, "src/renderer/index.html"), "utf8")
		expect(html).toContain("GCode")
		expect(html).not.toContain("M612.104")
	})

	test("electron-builder product identity is GCode", () => {
		const yml = readFileSync(join(root, "electron-builder.yml"), "utf8")
		expect(yml).toContain("productName: GCode")
		expect(yml).toContain("appId: com.gcode.desktop")
		expect(yml).not.toContain("productName: Palot")
		expect(yml).not.toContain("com.palot")
	})

	test("renderer entry is the React product shell with Lit registration", () => {
		const main = readFileSync(join(root, "src/renderer/main.tsx"), "utf8")
		expect(main).toContain("./app")
		expect(main).toContain("createRoot")
		expect(main).toContain("./lit/register")
		expect(main).not.toContain("./lit/main-lit")
	})
})
