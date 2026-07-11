/**
 * Settings chrome + empty-state production path (Lit hosts).
 */
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"

describe("settings chrome Lit hosts", () => {
	test("SettingsRow is a Lit custom element", () => {
		const src = readFileSync(
			path.resolve(import.meta.dir, "../src/renderer/lit/components/gcode-settings-row.ts"),
			"utf8",
		)
		expect(src).toContain('@customElement("gcode-settings-row")')
	})

	test("SettingsSection is a Lit custom element", () => {
		const src = readFileSync(
			path.resolve(import.meta.dir, "../src/renderer/lit/components/gcode-settings-section.ts"),
			"utf8",
		)
		expect(src).toContain('@customElement("gcode-settings-section")')
	})

	test("CliApprovalBar is a Lit custom element", () => {
		const src = readFileSync(
			path.resolve(import.meta.dir, "../src/renderer/lit/components/gcode-cli-approval.ts"),
			"utf8",
		)
		expect(src).toContain('@customElement("gcode-cli-approval")')
	})

	test("EmptyState is a Lit custom element", () => {
		const src = readFileSync(
			path.resolve(import.meta.dir, "../src/renderer/lit/components/gcode-empty-state.ts"),
			"utf8",
		)
		expect(src).toContain('@customElement("gcode-empty-state")')
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
