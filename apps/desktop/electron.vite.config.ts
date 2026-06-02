import fs from "node:fs"
import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, externalizeDepsPlugin } from "electron-vite"
import type { Plugin } from "vite"
import { createDesktopAliases, desktopFsAllow, DESKTOP_PRELOAD_ENTRY, DESKTOP_SHARED_ENTRY } from "./vite-aliases"

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

const rendererRoot = path.resolve(__dirname, "src/renderer")
const palotUiRoot = path.resolve(__dirname, "../../packages/ui/src")

const mainPreloadAliases = [
	{ find: "@desktop/shared", replacement: DESKTOP_SHARED_ENTRY },
	{ find: "@desktop/preload", replacement: DESKTOP_PRELOAD_ENTRY },
]

const rendererAliases = createDesktopAliases({ rendererRoot, palotUiRoot })

export default defineConfig({
	main: {
		resolve: {
			alias: mainPreloadAliases,
		},
		plugins: [
			externalizeDepsPlugin({ exclude: ["@palot/configconv", "drizzle-orm"] }),
			copyDrizzleMigrations(),
		],
		build: {
			rollupOptions: {
				input: { index: path.resolve(__dirname, "src/main/index.ts") },
			},
		},
	},
	preload: {
		resolve: {
			alias: mainPreloadAliases,
		},
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
		root: rendererRoot,
		plugins: [react(), tailwindcss()],
		resolve: {
			alias: rendererAliases,
		},
		worker: {
			format: "es",
		},
		server: {
			port: 1420,
			strictPort: true,
			fs: {
				allow: desktopFsAllow(),
			},
		},
		build: {
			rollupOptions: {
				input: { index: path.resolve(__dirname, "src/renderer/index.html") },
			},
		},
	},
})