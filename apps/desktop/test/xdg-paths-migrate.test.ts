/**
 * XDG path migration: legacy ~/.config/palot and ~/.local/share/palot
 * must rename into gcode on first access (product rebrand).
 */
import { afterEach, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { getConfigDir, getDataDir } from "../src/main/automation/paths"

const roots: string[] = []

afterEach(() => {
	for (const r of roots.splice(0)) {
		fs.rmSync(r, { recursive: true, force: true })
	}
	delete process.env.XDG_CONFIG_HOME
	delete process.env.XDG_DATA_HOME
})

function tempRoot(): string {
	const r = fs.mkdtempSync(path.join(os.tmpdir(), "gcode-xdg-"))
	roots.push(r)
	return r
}

describe("XDG paths migrate from palot → gcode", () => {
	test("getConfigDir renames legacy palot config tree", () => {
		const root = tempRoot()
		process.env.XDG_CONFIG_HOME = path.join(root, "config")
		const legacy = path.join(process.env.XDG_CONFIG_HOME, "palot")
		const next = path.join(process.env.XDG_CONFIG_HOME, "gcode")
		fs.mkdirSync(path.join(legacy, "automations", "a1"), { recursive: true })
		fs.writeFileSync(path.join(legacy, "automations", "a1", "config.json"), "{}")

		const dir = getConfigDir()
		expect(dir).toBe(next)
		expect(fs.existsSync(path.join(next, "automations", "a1", "config.json"))).toBe(true)
		expect(fs.existsSync(legacy)).toBe(false)
	})

	test("getDataDir renames legacy dir and palot.db → gcode.db", () => {
		const root = tempRoot()
		process.env.XDG_DATA_HOME = path.join(root, "data")
		const legacy = path.join(process.env.XDG_DATA_HOME, "palot")
		const next = path.join(process.env.XDG_DATA_HOME, "gcode")
		fs.mkdirSync(legacy, { recursive: true })
		fs.writeFileSync(path.join(legacy, "palot.db"), "sqlite-bytes")

		const dir = getDataDir()
		expect(dir).toBe(next)
		expect(fs.existsSync(path.join(next, "gcode.db"))).toBe(true)
		expect(fs.existsSync(path.join(next, "palot.db"))).toBe(false)
		expect(fs.existsSync(legacy)).toBe(false)
	})
})
