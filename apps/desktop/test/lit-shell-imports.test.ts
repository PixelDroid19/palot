/**
 * Migrated Lit product entry must not require React.
 */
import { describe, expect, test } from "bun:test"
import { readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"

function walk(dir: string, acc: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		const full = path.join(dir, name)
		if (statSync(full).isDirectory()) walk(full, acc)
		else if (full.endsWith(".ts") && !full.endsWith(".css.js")) acc.push(full)
	}
	return acc
}

describe("Lit product import graph (no React)", () => {
	test("lit/**/*.ts does not import react, react-dom, or jotai", () => {
		const root = path.resolve(import.meta.dir, "../src/renderer/lit")
		const files = walk(root)
		expect(files.length).toBeGreaterThan(8)
		const offenders: string[] = []
		for (const f of files) {
			const text = readFileSync(f, "utf8")
			if (
				/\bfrom\s+["']react["']/.test(text) ||
				/\bfrom\s+["']react-dom/.test(text) ||
				/\bfrom\s+["']jotai/.test(text)
			) {
				offenders.push(path.relative(root, f))
			}
		}
		expect(offenders).toEqual([])
	})

	test("main.tsx mounts Lit without a React fallback", () => {
		const main = readFileSync(
			path.resolve(import.meta.dir, "../src/renderer/main.tsx"),
			"utf8",
		)
		expect(main).toContain('import("./lit/main-lit")')
		expect(main).not.toMatch(/react|\.\/app/)
	})

	test("desktop manifest and Vite configuration do not depend on React", () => {
		const desktopRoot = path.resolve(import.meta.dir, "..")
		const packageJson = readFileSync(path.join(desktopRoot, "package.json"), "utf8")
		const electronVite = readFileSync(path.join(desktopRoot, "electron.vite.config.ts"), "utf8")
		const webVite = readFileSync(
			path.join(desktopRoot, "src/renderer/vite.web.config.ts"),
			"utf8",
		)
		for (const source of [packageJson, electronVite, webVite]) {
			expect(source).not.toMatch(/(?:react|jotai|tailwind)(?:[-"/]|$)/i)
		}
	})
})
