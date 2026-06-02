import { defineConfig, devices } from "@playwright/test"

const isCI = !!process.env.CI

/**
 * E2E tests for browser-mode dev (Palot Bun server + Vite renderer).
 *
 * Demo-mode UI tests use `?mock=1` and do not require OpenCode.
 * Live tests in app-live.spec.ts need the OpenCode CLI installed.
 */
export default defineConfig({
	testDir: "e2e",
	timeout: 60_000,
	expect: { timeout: 15_000 },
	retries: isCI ? 2 : 0,
	workers: isCI ? 1 : undefined,
	reporter: isCI ? [["github"], ["list"]] : [["list"]],
	use: {
		...devices["Desktop Chrome"],
		testIdAttribute: "data-testid",
		baseURL: "http://localhost:1420",
		trace: "on-first-retry",
		screenshot: "only-on-failure",
	},
	webServer: [
		{
			command: "bun run dev",
			cwd: "apps/server",
			url: "http://localhost:3100/health",
			reuseExistingServer: !isCI,
			timeout: 120_000,
			stdout: "pipe",
			stderr: "pipe",
		},
		{
			command: "bun run dev:web",
			cwd: "apps/desktop",
			url: "http://localhost:1420",
			reuseExistingServer: !isCI,
			timeout: 120_000,
			stdout: "pipe",
			stderr: "pipe",
		},
	],
})
