/**
 * Compile co-located `.scss` files into Lit `css` modules (`*.css.js`).
 *
 * Usage:
 *   bun run scripts/scss-to-cssjs.ts           # one-shot all
 *   bun run scripts/scss-to-cssjs.ts --watch   # recompile on save
 *   bun run scripts/scss-to-cssjs.ts path/to/file.scss
 */

import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { watch as chokidarWatch } from "chokidar"
import * as sass from "sass"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..")
const LIT_ROOT = path.join(ROOT, "src/renderer/lit")

export function scssPathToCssJs(scssPath: string): string {
	return scssPath.replace(/\.scss$/i, ".css.js")
}

/**
 * Compile one SCSS file to a Lit-compatible `*.css.js` module.
 * Returns the absolute path of the written file.
 */
export function compileScssToCssJs(scssPath: string): string {
	const absolute = path.isAbsolute(scssPath) ? scssPath : path.resolve(ROOT, scssPath)
	const result = sass.compile(absolute, {
		style: "compressed",
		loadPaths: [path.dirname(absolute), path.join(LIT_ROOT, "styles")],
	})
	// Escape for template literal inside generated module
	const cssText = result.css.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${")
	const outPath = scssPathToCssJs(absolute)
	mkdirSync(path.dirname(outPath), { recursive: true })
	const body = `/* AUTO-GENERATED from ${path.basename(absolute)} — do not edit */
import { css } from "lit";
export const styles = css\`${cssText}\`;
export default styles;
`
	writeFileSync(outPath, body, "utf8")
	return outPath
}

function walkScss(dir: string, acc: string[] = []): string[] {
	if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return acc
	for (const name of readdirSync(dir)) {
		const full = path.join(dir, name)
		const st = statSync(full)
		if (st.isDirectory()) walkScss(full, acc)
		else if (name.endsWith(".scss") && !name.startsWith("_")) acc.push(full)
	}
	return acc
}

/** Compile every non-partial `.scss` under the Lit tree. */
export function compileAllLitScss(): string[] {
	const files = walkScss(LIT_ROOT)
	return files.map((f) => compileScssToCssJs(f))
}

async function main(): Promise<void> {
	const args = process.argv.slice(2)
	const watch = args.includes("--watch")
	const targets = args.filter((a) => !a.startsWith("--"))

	if (targets.length > 0) {
		for (const t of targets) {
			const out = compileScssToCssJs(t)
			console.log("compiled", path.relative(ROOT, out))
		}
		return
	}

	const written = compileAllLitScss()
	console.log(`compiled ${written.length} scss → css.js under lit/`)
	for (const w of written) console.log(" ", path.relative(ROOT, w))

	if (!watch) return

	const watcher = chokidarWatch(path.join(LIT_ROOT, "**/*.scss"), {
		ignoreInitial: true,
		awaitWriteFinish: { stabilityThreshold: 80, pollInterval: 20 },
	})
	const onChange = (file: string) => {
		try {
			if (path.basename(file).startsWith("_")) {
				// partials affect dependents — recompile all
				const all = compileAllLitScss()
				console.log(`[watch] partial changed → recompiled ${all.length}`)
				return
			}
			const out = compileScssToCssJs(file)
			console.log("[watch]", path.relative(ROOT, out))
		} catch (err) {
			console.error("[watch] scss compile failed", file, err)
		}
	}
	watcher.on("add", onChange).on("change", onChange)
	console.log("watching", path.relative(ROOT, LIT_ROOT), "for .scss changes…")
}

if (import.meta.main) {
	main().catch((err) => {
		console.error(err)
		process.exit(1)
	})
}
