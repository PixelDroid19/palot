/**
 * Public runtime-mark path constants + Lit production path (shipped).
 */
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"
import {
	CLAUDE_BRAND_FILL,
	CLAUDE_MARK_PATH,
	CODEX_MARK_PATH,
	OPENCODE_MARK_PATH,
} from "../src/renderer/lit/runtime-mark-paths"
import { runtimeIdToIconKey } from "../src/renderer/lib/runtime-icons"

describe("runtime mark paths (public)", () => {
	test("brand path data is non-empty SVG path geometry", () => {
		expect(CLAUDE_MARK_PATH.startsWith("M")).toBe(true)
		expect(CLAUDE_MARK_PATH.length).toBeGreaterThan(50)
		expect(CODEX_MARK_PATH.startsWith("M")).toBe(true)
		expect(CODEX_MARK_PATH.length).toBeGreaterThan(100)
		expect(OPENCODE_MARK_PATH.startsWith("M")).toBe(true)
		expect(CLAUDE_BRAND_FILL).toMatch(/^#[0-9A-Fa-f]{6}$/)
	})

	test("path selection keys align with runtimeIdToIconKey registry", () => {
		expect(runtimeIdToIconKey("claude")).toBe("claude")
		expect(runtimeIdToIconKey("codex")).toBe("codex")
		expect(runtimeIdToIconKey("opencode")).toBe("opencode")
	})

	test("React host mounts Lit custom element only (no dual path markup)", () => {
		const host = readFileSync(
			path.resolve(import.meta.dir, "../src/renderer/components/runtime-mark.tsx"),
			"utf8",
		)
		expect(host).toContain("gcode-runtime-mark")
		expect(host).toContain("../lit/components/gcode-runtime-mark")
		expect(host).not.toContain("CLAUDE_MARK_PATH")
		expect(host).not.toContain('d="M26.9568')
		expect(host).not.toContain("function ClaudeMark")
	})

	test("Lit element uses public path module and pure icon helpers", () => {
		const lit = readFileSync(
			path.resolve(import.meta.dir, "../src/renderer/lit/components/gcode-runtime-mark.ts"),
			"utf8",
		)
		expect(lit).toContain("CLAUDE_MARK_PATH")
		expect(lit).toContain("runtimeIdToIconKey")
		expect(lit).toContain('@customElement("gcode-runtime-mark")')
	})
})
