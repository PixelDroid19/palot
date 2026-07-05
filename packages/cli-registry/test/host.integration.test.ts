import { describe, expect, test } from "bun:test"
import os from "node:os"
import path from "node:path"
import { expandHome, runCapture, whichOnPath } from "../src/host"

describe("whichOnPath (real PATH)", () => {
	test("resolves a binary that exists on PATH", async () => {
		const resolved = await whichOnPath("node")
		expect(resolved).not.toBeNull()
		expect(path.isAbsolute(resolved as string)).toBe(true)
	})

	test("returns null for a binary that does not exist", async () => {
		const resolved = await whichOnPath("palot-definitely-not-a-real-binary-9x8y7z")
		expect(resolved).toBeNull()
	})
})

describe("runCapture (real process)", () => {
	test("captures stdout from a real command", async () => {
		const out = await runCapture("node", ["--version"])
		expect(out).toMatch(/^v?\d+\.\d+\.\d+/)
	})

	test("resolves (never throws) when the binary is missing", async () => {
		const out = await runCapture("palot-definitely-not-a-real-binary-9x8y7z", ["--version"])
		expect(typeof out).toBe("string")
	})
})

describe("expandHome", () => {
	test("expands a leading tilde to the home directory", () => {
		expect(expandHome("~")).toBe(os.homedir())
		expect(expandHome("~/.config/opencode")).toBe(
			path.join(os.homedir(), ".config/opencode"),
		)
	})
	test("leaves absolute and relative paths untouched", () => {
		expect(expandHome("/etc/hosts")).toBe("/etc/hosts")
		expect(expandHome("./local")).toBe("./local")
	})
})
