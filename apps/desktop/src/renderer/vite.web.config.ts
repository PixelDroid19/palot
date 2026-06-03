/**
 * Standalone Vite config for browser-mode development (no Electron).
 * Usage: bun run dev:web (or `vite --config src/renderer/vite.web.config.ts`)
 *
 * In this mode, the Palot Bun server (apps/server) must be running
 * on port 3100 to handle filesystem operations and process management.
 */

import path from "node:path"
import { fileURLToPath } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { palotLitScss } from "@palot/lit-styles/vite-plugin"
import { createDesktopAliases, desktopFsAllow } from "../../vite-aliases"

const rendererRoot = path.dirname(fileURLToPath(import.meta.url))
const palotUiRoot = path.resolve(rendererRoot, "../../../../packages/ui/src")

export default defineConfig({
	root: rendererRoot,
	plugins: [react(), tailwindcss(), palotLitScss()],
	resolve: {
		alias: createDesktopAliases({ rendererRoot, palotUiRoot }),
	},
	clearScreen: false,
	server: {
		port: 1420,
		strictPort: true,
		fs: {
			allow: desktopFsAllow(),
		},
	},
})