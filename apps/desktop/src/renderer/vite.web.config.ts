/**
 * Standalone Vite config for browser-mode development (no Electron).
 * Usage: bun run dev:web (or `vite --config src/renderer/vite.web.config.ts`)
 *
 * In this mode, the GCode Bun server (apps/server) must be running
 * on port 3100 to handle filesystem operations and process management.
 * Product UI is Lit-only — no React / Tailwind plugins.
 */

import { defineConfig } from "vite"

export default defineConfig({
	root: __dirname,
	plugins: [],
	resolve: {
		alias: {
			"@": __dirname,
		},
	},
	clearScreen: false,
	server: {
		port: 1420,
		strictPort: true,
	},
})
