import { ADAPTERS } from "./adapters/index"
import type { AuthState, CliAdapter, CliDetection, DetectionHost } from "./types"

/** Default semver-ish extractor: first `x.y.z` (optionally with suffix). */
export function defaultParseVersion(raw: string): string | null {
	const match = raw.match(/\d+\.\d+\.\d+(?:[-+][\w.]+)?/)
	return match ? match[0] : null
}

function resolveAuth(adapter: CliAdapter, host: DetectionHost): AuthState {
	if (!adapter.authPaths || adapter.authPaths.length === 0) return "unknown"
	for (const path of adapter.authPaths) {
		if (host.pathExists(path)) return "authenticated"
	}
	return "unauthenticated"
}

/**
 * Probe a single CLI on the host. Never throws — a CLI that is missing or
 * misbehaving yields an `installed: false` detection rather than an error.
 */
export async function detectOne(adapter: CliAdapter, host: DetectionHost): Promise<CliDetection> {
	const base: CliDetection = {
		id: adapter.id,
		displayName: adapter.displayName,
		docsUrl: adapter.docsUrl,
		installHint: adapter.installHint,
		managed: adapter.managed,
		installed: false,
		binaryPath: null,
		version: null,
		auth: "unknown",
	}

	let binaryPath: string | null = null
	for (const binary of adapter.binaries) {
		binaryPath = await host.which(binary)
		if (binaryPath) break
	}

	if (!binaryPath) return base

	let version: string | null = null
	try {
		const raw = await host.run(binaryPath, adapter.versionArgs)
		const parse = adapter.parseVersion ?? defaultParseVersion
		version = parse(raw)
	} catch {
		version = null
	}

	return {
		...base,
		installed: true,
		binaryPath,
		version,
		auth: resolveAuth(adapter, host),
	}
}

/** Probe every known CLI concurrently, preserving registry order. */
export async function detectAll(host: DetectionHost): Promise<CliDetection[]> {
	return Promise.all(ADAPTERS.map((adapter) => detectOne(adapter, host)))
}
