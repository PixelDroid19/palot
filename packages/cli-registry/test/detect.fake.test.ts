import { describe, expect, test } from "bun:test"
import { detectOne } from "../src/detect"
import type { CliAdapter, DetectionHost } from "../src/types"

/**
 * Deterministic detection tests driven by a fake {@link DetectionHost}. These
 * cover branches the real-system integration tests can't pin down: binary
 * preference order, custom version parsing, and auth-path priority.
 */
function fakeHost(overrides: Partial<DetectionHost> & {
	binaries?: Record<string, string>
	versions?: Record<string, string>
	files?: string[]
}): DetectionHost {
	const binaries = overrides.binaries ?? {}
	const versions = overrides.versions ?? {}
	const files = new Set(overrides.files ?? [])
	return {
		which: overrides.which ?? (async (b) => binaries[b] ?? null),
		run: overrides.run ?? (async (bin) => versions[bin] ?? ""),
		pathExists: overrides.pathExists ?? ((p) => files.has(p)),
	}
}

const BASE: CliAdapter = {
	id: "opencode",
	displayName: "Test CLI",
	binaries: ["primary", "fallback"],
	versionArgs: ["--version"],
	docsUrl: "https://example.com",
	installHint: "install it",
	managed: true,
}

describe("detectOne with a fake host", () => {
	test("prefers the first binary found, honoring adapter order", async () => {
		const host = fakeHost({
			binaries: { primary: "/usr/bin/primary", fallback: "/usr/bin/fallback" },
			versions: { "/usr/bin/primary": "primary 1.2.3" },
		})
		const r = await detectOne(BASE, host)
		expect(r.binaryPath).toBe("/usr/bin/primary")
		expect(r.version).toBe("1.2.3")
	})

	test("falls back to the second binary when the first is missing", async () => {
		const host = fakeHost({
			binaries: { fallback: "/opt/fallback" },
			versions: { "/opt/fallback": "v2.0.0" },
		})
		const r = await detectOne(BASE, host)
		expect(r.installed).toBe(true)
		expect(r.binaryPath).toBe("/opt/fallback")
		expect(r.version).toBe("2.0.0")
	})

	test("uses a custom parseVersion when provided", async () => {
		const adapter: CliAdapter = {
			...BASE,
			parseVersion: (raw) => raw.trim().replace(/^Version:\s*/, "") || null,
		}
		const host = fakeHost({
			binaries: { primary: "/bin/primary" },
			versions: { "/bin/primary": "Version: 9-alpha" },
		})
		const r = await detectOne(adapter, host)
		expect(r.version).toBe("9-alpha")
	})

	test("reports version null when output has no recognizable version", async () => {
		const host = fakeHost({
			binaries: { primary: "/bin/primary" },
			versions: { "/bin/primary": "some unrelated banner" },
		})
		const r = await detectOne(BASE, host)
		expect(r.installed).toBe(true)
		expect(r.version).toBeNull()
	})

	test("does not throw when the version probe rejects", async () => {
		const host = fakeHost({
			binaries: { primary: "/bin/primary" },
			run: async () => {
				throw new Error("spawn failed")
			},
		})
		const r = await detectOne(BASE, host)
		expect(r.installed).toBe(true)
		expect(r.version).toBeNull()
	})

	test("resolves auth from the first matching auth path", async () => {
		const adapter: CliAdapter = {
			...BASE,
			authPaths: ["~/.config/a/auth.json", "~/.config/b/auth.json"],
		}
		const host = fakeHost({
			binaries: { primary: "/bin/primary" },
			files: ["~/.config/b/auth.json"],
		})
		const r = await detectOne(adapter, host)
		expect(r.auth).toBe("authenticated")
	})

	test("auth is unauthenticated when no auth path exists", async () => {
		const adapter: CliAdapter = { ...BASE, authPaths: ["~/.config/a/auth.json"] }
		const host = fakeHost({ binaries: { primary: "/bin/primary" } })
		const r = await detectOne(adapter, host)
		expect(r.auth).toBe("unauthenticated")
	})

	test("auth is unknown when the adapter declares no auth paths", async () => {
		const host = fakeHost({ binaries: { primary: "/bin/primary" } })
		const r = await detectOne(BASE, host)
		expect(r.auth).toBe("unknown")
	})

	test("a missing binary yields a fully-empty detection and skips auth", async () => {
		const adapter: CliAdapter = { ...BASE, authPaths: ["~/exists"] }
		const host = fakeHost({ files: ["~/exists"] }) // file present, but no binary
		const r = await detectOne(adapter, host)
		expect(r.installed).toBe(false)
		expect(r.binaryPath).toBeNull()
		expect(r.version).toBeNull()
		// auth must not be probed when the CLI isn't installed
		expect(r.auth).toBe("unknown")
	})
})
