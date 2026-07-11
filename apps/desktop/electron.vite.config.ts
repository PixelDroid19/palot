import fs from "node:fs"
import path from "node:path"
import { defineConfig, externalizeDepsPlugin } from "electron-vite"
import type { Plugin } from "vite"

/**
 * Copies the drizzle migrations directory into the main process output.
 *
 * viteStaticCopy does not reliably fire during electron-vite's dev rebuilds,
 * so we use a plain Rollup writeBundle hook instead.
 */
function copyDrizzleMigrations(): Plugin {
	const src = path.resolve(__dirname, "drizzle")
	return {
		name: "copy-drizzle-migrations",
		writeBundle(options) {
			const dest = path.join(options.dir!, "drizzle")
			if (fs.existsSync(src)) {
				fs.cpSync(src, dest, { recursive: true })
			}
		},
	}
}

export default defineConfig({
	main: {
		plugins: [
			// Workspace packages ship as TypeScript source, so they must be bundled
			// into the main process rather than externalized (Node's ESM loader
			// can't resolve their extensionless/source imports at runtime).
			externalizeDepsPlugin({
				exclude: ["@gcode/configconv", "@gcode/cli-registry", "@gcode/agent-host", "drizzle-orm"],
			}),
			copyDrizzleMigrations(),
		],
		build: {
			rollupOptions: {
				input: { index: path.resolve(__dirname, "src/main/index.ts") },
			},
		},
	},
	preload: {
		// No externalizeDepsPlugin — sandboxed preloads must bundle all deps.
		// Output CJS because Electron sandboxed preloads cannot use ESM.
		build: {
			rollupOptions: {
				input: { index: path.resolve(__dirname, "src/preload/index.ts") },
				output: {
					format: "cjs",
				},
			},
		},
	},
	renderer: {
		root: path.resolve(__dirname, "src/renderer"),
		plugins: [],
		resolve: {
			alias: {
				"@": path.resolve(__dirname, "src/renderer"),
			},
		},
		worker: {
			format: "es",
		},
		server: {
			port: 1420,
			strictPort: true,
		},
		build: {
			rollupOptions: {
				input: { index: path.resolve(__dirname, "src/renderer/index.html") },
			},
		},
	},
})
