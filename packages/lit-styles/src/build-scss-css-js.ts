#!/usr/bin/env bun
/**
 * SCSS to css.js generator for Lit components.
 * Scans for palot-*.scss files in the monorepo (under packages/lit-components/src)
 * Compiles SCSS with sass, wraps as `import { css } from "lit"; export const styles = css`...`
 * Edits only .scss; this is generated.
 *
 * Run: `bun run build:styles` from root (via turbo), or `cd packages/lit-styles && bun run build:styles`, or `bun --filter=@palot/lit-styles run build:styles`.
 * Also available as `bun run build:styles` inside packages/lit-components (delegates to this).
 * Called before typecheck/builds that consume generated css.js + .d.ts . See IMPORT-ARCHITECTURE.md and roadmap/lit-migration.md.
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { basename, dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import * as sass from "sass"

/**
 * Resolve lit-components/src robustly relative to this script location.
 * Supports:
 * - running "bun run build:styles" from packages/lit-styles (cwd=lit-styles)
 * - running from packages/lit-components (bun ../lit-styles/src/build-...)
 * - running from repo root (bun packages/lit-styles/src/build-...)
 * - vite plugin exec from root
 */
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const LIT_COMPONENTS_SRC = join(__dirname, "../../lit-components/src")

function findScssFiles(dir: string): string[] {
	const entries = readdirSync(dir)
	let files: string[] = []
	for (const entry of entries) {
		const full = join(dir, entry)
		try {
			const st = statSync(full)
			if (st.isDirectory()) {
				files = files.concat(findScssFiles(full))
			} else if (entry.endsWith(".scss") && entry.startsWith("palot-")) {
				files.push(full)
			}
		} catch {}
	}
	return files
}

function generateForScss(scssPath: string) {
	const scssContent = readFileSync(scssPath, "utf8")
	let css: string
	try {
		const result = sass.compileString(scssContent, {
			style: "expanded",
			loadPaths: [dirname(scssPath)],
		})
		css = result.css
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : String(e)
		console.error(`SCSS compile error in ${scssPath}:`, msg)
		process.exit(1)
	}

	const base = basename(scssPath, ".scss")
	const outPath = join(dirname(scssPath), `${base}.css.js`)

	const jsContent = `import { css } from "lit"

export const styles = css\`
${css.trim().replace(/`/g, "\\`")}
\`
`

	writeFileSync(outPath, jsContent)

	// Also generate .d.ts for TS consumers that don't resolve the package's ambient
	const dtsContent = `import { CSSResult } from "lit"
export declare const styles: CSSResult
`
	writeFileSync(outPath.replace(".js", ".d.ts"), dtsContent)
	console.log(`Generated: ${outPath} and .d.ts`)
}

console.log("Building Lit SCSS -> css.js ...")
const scssFiles = findScssFiles(LIT_COMPONENTS_SRC)
if (scssFiles.length === 0) {
	console.log("No palot-*.scss files found.")
	process.exit(0)
}
for (const f of scssFiles) {
	generateForScss(f)
}
console.log(`Done. Processed ${scssFiles.length} component(s).`)
