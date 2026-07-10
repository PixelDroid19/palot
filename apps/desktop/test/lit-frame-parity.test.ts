/**
 * Guardrails for the Lit shell's React-reference geometry.
 * Visual screenshots remain the authoritative parity evidence; these checks
 * stop accidental reintroduction of the prototype card layout.
 */
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"

const renderer = path.resolve(import.meta.dir, "../src/renderer")

function read(relative: string): string {
	return readFileSync(path.join(renderer, relative), "utf8")
}

describe("Lit app-frame parity contract", () => {
	test("uses the React reference frame dimensions and Cortex tokens", () => {
		const tokens = read("lit/styles/_tokens.scss")
		const appStyles = read("lit/components/gcode-app.scss")
		expect(tokens).toContain("--gcode-sidebar-width: 280px")
		expect(tokens).toContain("--gcode-titlebar-height: 46px")
		expect(tokens).toContain("--gcode-bg: #181818")
		expect(tokens).toContain("--gcode-sidebar: #0d0d0d")
		expect(appStyles).toContain(".appbar")
		expect(appStyles).toContain(".window-controls")
	})

	test("home retains the React prompt catalogue and bottom composer hierarchy", () => {
		const home = read("lit/components/gcode-home.ts")
		const styles = read("lit/components/gcode-home.scss")
		expect(home).toContain("Build what's next")
		expect(home).toContain("What should this session work on?")
		expect(home).toContain("No workspaces visible yet")
		expect(styles).toContain("grid-template-columns: repeat(3, minmax(0, 1fr))")
		expect(styles).toContain(".composer-area")
	})

	test("the Lit tree remains free of React runtime imports", () => {
		for (const relative of [
			"lit/components/gcode-app.ts",
			"lit/components/gcode-home.ts",
			"lit/components/gcode-sidebar.ts",
		]) {
			const source = read(relative)
			expect(source).not.toMatch(/from ["']react|from ["']jotai|@tanstack\/react/)
		}
	})
})
