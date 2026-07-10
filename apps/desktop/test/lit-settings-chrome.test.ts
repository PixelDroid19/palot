/**
 * Settings chrome + empty-state production path (Lit hosts).
 */
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"

describe("settings chrome Lit hosts", () => {
	test("SettingsRow is Lit-only host", () => {
		const src = readFileSync(
			path.resolve(import.meta.dir, "../src/renderer/components/settings/settings-row.tsx"),
			"utf8",
		)
		expect(src).toContain("gcode-settings-row")
		expect(src).not.toContain("className=")
		expect(src).not.toContain("flex items-center justify-between")
	})

	test("SettingsSection is Lit-only host", () => {
		const src = readFileSync(
			path.resolve(import.meta.dir, "../src/renderer/components/settings/settings-section.tsx"),
			"utf8",
		)
		expect(src).toContain("gcode-settings-section")
		expect(src).not.toContain("divide-y")
	})

	test("CliApprovalBar hosts Lit panel", () => {
		const src = readFileSync(
			path.resolve(import.meta.dir, "../src/renderer/components/chat/cli-approval-bar.tsx"),
			"utf8",
		)
		expect(src).toContain("gcode-cli-approval")
		expect(src).toContain("gcode-permission-decision")
		expect(src).not.toContain("bg-amber-500/10")
	})

	test("NotFound + Error pages host Lit empty-state", () => {
		const nf = readFileSync(
			path.resolve(import.meta.dir, "../src/renderer/components/not-found-page.tsx"),
			"utf8",
		)
		const er = readFileSync(
			path.resolve(import.meta.dir, "../src/renderer/components/error-page.tsx"),
			"utf8",
		)
		expect(nf).toContain("gcode-empty-state")
		expect(er).toContain("gcode-empty-state")
		expect(nf).not.toContain("SearchXIcon")
		expect(er).not.toContain("AlertTriangleIcon")
	})

	test("Lit SCSS uses Cortex tokens not neon rails", () => {
		const row = readFileSync(
			path.resolve(import.meta.dir, "../src/renderer/lit/components/gcode-settings-row.scss"),
			"utf8",
		)
		expect(row).toContain("--muted-foreground")
		expect(row).toContain("--foreground")
	})
})
