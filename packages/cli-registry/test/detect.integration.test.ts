import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { ADAPTERS } from "../src/adapters/index"
import { defaultParseVersion, detectAll, detectOne } from "../src/detect"
import { createNodeHost } from "../src/host"
import type { CliAdapter } from "../src/types"

const host = createNodeHost()

// `node` is guaranteed present in the test runtime, so we use it as a stand-in
// binary to exercise the real detection pipeline end-to-end (PATH resolution +
// spawning `--version` + version parsing) without depending on any agent CLI
// being installed on the machine running the suite.
const NODE_ADAPTER: CliAdapter = {
	id: "opencode",
	displayName: "Node (test stand-in)",
	binaries: ["node"],
	versionArgs: ["--version"],
	docsUrl: "https://nodejs.org",
	installHint: "install node",
	managed: true,
}

const MISSING_ADAPTER: CliAdapter = {
	id: "codex",
	displayName: "Definitely Missing",
	binaries: ["palot-definitely-not-a-real-binary-9x8y7z"],
	versionArgs: ["--version"],
	docsUrl: "https://example.com",
	installHint: "n/a",
	managed: false,
}

describe("detectOne (real host)", () => {
	test("detects an installed binary and parses its real version", async () => {
		const result = await detectOne(NODE_ADAPTER, host)
		expect(result.installed).toBe(true)
		expect(result.binaryPath).not.toBeNull()
		expect(result.binaryPath).toContain("node")
		// node --version emits e.g. "v22.3.0"; we should extract "22.3.0".
		expect(result.version).toMatch(/^\d+\.\d+\.\d+/)
	})

	test("reports a missing binary as not installed", async () => {
		const result = await detectOne(MISSING_ADAPTER, host)
		expect(result.installed).toBe(false)
		expect(result.binaryPath).toBeNull()
		expect(result.version).toBeNull()
		expect(result.auth).toBe("unknown")
	})

	test("resolves auth from a real credential file on disk", async () => {
		const dir = mkdtempSync(path.join(os.tmpdir(), "cli-registry-auth-"))
		const authFile = path.join(dir, "auth.json")
		try {
			const missing = await detectOne(
				{ ...NODE_ADAPTER, authPaths: [authFile] },
				host,
			)
			expect(missing.auth).toBe("unauthenticated")

			writeFileSync(authFile, "{}")
			const present = await detectOne(
				{ ...NODE_ADAPTER, authPaths: [authFile] },
				host,
			)
			expect(present.auth).toBe("authenticated")
		} finally {
			rmSync(dir, { recursive: true, force: true })
		}
	})
})

describe("detectAll (real host)", () => {
	test("returns a detection for every registered adapter without throwing", async () => {
		const results = await detectAll(host)
		expect(results).toHaveLength(ADAPTERS.length)
		expect(results.map((r) => r.id)).toEqual(ADAPTERS.map((a) => a.id))
		for (const r of results) {
			expect(typeof r.installed).toBe("boolean")
			expect(["authenticated", "unauthenticated", "unknown"]).toContain(r.auth)
		}
	})
})

describe("defaultParseVersion", () => {
	test("extracts semver from common --version shapes", () => {
		expect(defaultParseVersion("v22.3.0")).toBe("22.3.0")
		expect(defaultParseVersion("opencode 0.11.2")).toBe("0.11.2")
		expect(defaultParseVersion("1.5.4-beta.1")).toBe("1.5.4-beta.1")
	})
	test("returns null when no version is present", () => {
		expect(defaultParseVersion("no version here")).toBeNull()
	})
})
