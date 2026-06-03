/**
 * Vite plugin for Palot Lit SCSS.
 * In dev, watches and regenerates css.js on .scss change.
 * In build, ensures styles are generated.
 */

import { execSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { Plugin } from "vite"

/**
 * Resolve the generator script absolutely from *this* file's location.
 * This makes the plugin host-safe (works when cwd is apps/desktop, or any other).
 * No more hard-coded relative "bun packages/..." that breaks on `cd apps/desktop && bun run build`.
 * See current-review.md observations on Lit styles Vite plugin cwd behavior.
 */
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
// The build script lives next to this plugin in the same package src.
const generatorScript = path.resolve(__dirname, "build-scss-css-js.ts")
const generatorCmd = `bun ${generatorScript}`

export function palotLitScss(): Plugin {
	return {
		name: "palot-lit-scss",
		configureServer(server) {
			// Watch scss in lit-components (resolve relative to repo root from this file for safety)
			const repoRoot = path.resolve(__dirname, "../../../..")
			const watchDir = path.join(repoRoot, "packages/lit-components/src")
			server.watcher.add(watchDir)
			server.watcher.on("change", (file) => {
				if (file.endsWith(".scss") && file.includes("palot-")) {
					console.log(`[palot-lit-scss] Regenerating styles for ${file}`)
					try {
						execSync(generatorCmd, { stdio: "inherit" }) // absolute cmd, cwd irrelevant
					} catch (_e) {
						console.error("[palot-lit-scss] Style generation failed")
					}
				}
			})
		},
		buildStart() {
			console.log("[palot-lit-scss] Ensuring all Lit styles are generated for build...")
			try {
				execSync(generatorCmd, { stdio: "inherit" })
			} catch (_e) {
				this.error("Style generation failed during build")
			}
		},
	}
}
