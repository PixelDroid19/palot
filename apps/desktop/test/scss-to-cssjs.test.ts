/**
 * Real SCSS → css.js compile path used by the Lit toolchain.
 */
import { afterAll, describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { compileScssToCssJs, scssPathToCssJs } from "../scripts/scss-to-cssjs"

const dir = mkdtempSync(path.join(tmpdir(), "gcode-scss-"))

afterAll(() => {
	rmSync(dir, { recursive: true, force: true })
})

describe("scss-to-cssjs (shipped compiler)", () => {
	test("compiles SCSS into a Lit css module with styles export", () => {
		const scss = path.join(dir, "sample.scss")
		writeFileSync(
			scss,
			`
			$accent: #05bdf5;
			:host {
				color: $accent;
				display: block;
			}
			`,
		)
		const out = compileScssToCssJs(scss)
		expect(out).toBe(scssPathToCssJs(scss))
		expect(existsSync(out)).toBe(true)
		const body = readFileSync(out, "utf8")
		expect(body).toContain('import { css } from "lit"')
		expect(body).toContain("export const styles = css`")
		expect(body).toContain("#05bdf5")
		expect(body).toContain("display:block")
	})

	test("compiles a real lit component scss from the tree", () => {
		const scss = path.resolve(
			import.meta.dir,
			"../src/renderer/lit/components/gcode-sidebar.scss",
		)
		expect(existsSync(scss)).toBe(true)
		const out = compileScssToCssJs(scss)
		const body = readFileSync(out, "utf8")
		expect(body).toContain("export const styles")
		expect(body.length).toBeGreaterThan(200)
	})
})
