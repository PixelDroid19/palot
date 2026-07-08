/**
 * OpenCode CLI version compatibility definitions for Palot.
 *
 * Updated with each Palot release to reflect tested OpenCode versions.
 * The environment check in the onboarding flow uses these ranges to
 * decide whether to pass, warn, or block.
 */

import { execFile } from "node:child_process"
import { coerce, satisfies, valid } from "semver"
import { createLogger } from "./logger"
import { getOpenCodeAugmentedPath } from "./opencode-runtime"
import { waitForEnv } from "./shell-env"

const log = createLogger("compatibility")

// ============================================================
// Compatibility ranges (standard semver range syntax)
// ============================================================

export const OPENCODE_COMPAT = {
	/** Supported range -- aligned with the upgraded SDK/runtime integration. */
	supported: ">=1.17.0",
	/** Tested range -- versions actively tested against with the current runtime layer. */
	tested: "~1.17.0",
	/** Known-broken versions. These are hard-blocked with a specific message. */
	blocked: [] as string[],
}

// ============================================================
// Types
// ============================================================

export interface OpenCodeCheckResult {
	installed: boolean
	version: string | null
	path: string | null
	compatible: boolean
	compatibility: "ok" | "too-old" | "too-new" | "blocked" | "unknown"
	message: string | null
}

export type ManagedRuntimeCheckResult = OpenCodeCheckResult

// ============================================================
// Binary detection
// ============================================================

/** Build the augmented PATH that includes ~/.opencode/bin. */
function getAugmentedPath(): string {
	return getOpenCodeAugmentedPath()
}

/** Run a command and return stdout, or null on failure. */
function execAsync(
	cmd: string,
	args: string[],
	env: Record<string, string | undefined>,
): Promise<string | null> {
	return new Promise((resolve) => {
		execFile(cmd, args, { env, timeout: 5000 }, (err, stdout) => {
			if (err) {
				resolve(null)
				return
			}
			resolve(stdout.trim())
		})
	})
}

/** Binary names OpenCode installs under, depending on the install method (#107). */
const OPENCODE_BINARIES = ["opencode", "opencode-cli"]

/** Try to find the opencode binary and get its version. */
async function detectOpenCode(): Promise<{ version: string | null; path: string | null }> {
	// GUI launches get a minimal launchd env; wait for the login-shell PATH so
	// the check agrees with what the user's terminal sees.
	await waitForEnv()
	const augmentedPath = getAugmentedPath()
	const env = { ...process.env, PATH: augmentedPath }
	const whichCmd = process.platform === "win32" ? "where" : "which"

	for (const binary of OPENCODE_BINARIES) {
		// Try `<binary> --version` (the correct flag)
		const versionOutput = await execAsync(binary, ["--version"], env)
		if (versionOutput) {
			// Parse version from output -- could be "v0.2.14", "opencode v0.2.14", or "local"
			const match = versionOutput.match(/v?(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?)/)
			const version = match ? match[1] : versionOutput.trim()
			const binaryPath = await execAsync(whichCmd, [binary], env)
			return { version, path: binaryPath }
		}
	}

	// Fallback: check if a binary exists at all (might not support --version)
	for (const binary of OPENCODE_BINARIES) {
		const binaryPath = await execAsync(whichCmd, [binary], env)
		if (binaryPath) {
			return { version: "unknown", path: binaryPath }
		}
	}

	return { version: null, path: null }
}

// ============================================================
// Public API
// ============================================================

/**
 * Check whether OpenCode is installed and compatible with this version of Palot.
 * Runs the binary to get its version, then compares against the compatibility range.
 */
export async function checkOpenCode(): Promise<OpenCodeCheckResult> {
	log.info("Checking OpenCode installation...")

	const { version, path: binaryPath } = await detectOpenCode()

	if (!version) {
		log.warn("OpenCode CLI not found")
		return {
			installed: false,
			version: null,
			path: null,
			compatible: false,
			compatibility: "unknown",
			message: "OpenCode CLI not found. Install it from https://opencode.ai",
		}
	}

	log.info("OpenCode found", { version, path: binaryPath })

	// Coerce loose version strings (e.g. "1.3" -> "1.3.0") into valid semver.
	// Non-semver versions (e.g. "local", "dev", "unknown") are assumed compatible --
	// these are typically local/dev builds where the user knows what they're doing.
	const parsed = valid(version) ?? coerce(version)?.version ?? null
	if (!parsed) {
		log.info("Non-semver version detected, assuming compatible", { version })
		return {
			installed: true,
			version,
			path: binaryPath,
			compatible: true,
			compatibility: "ok",
			message: null,
		}
	}

	// Check blocked versions
	for (const blocked of OPENCODE_COMPAT.blocked) {
		if (satisfies(parsed, blocked)) {
			return {
				installed: true,
				version,
				path: binaryPath,
				compatible: false,
				compatibility: "blocked",
				message: `OpenCode ${version} has known issues with this version of Palot. Please update.`,
			}
		}
	}

	// Check supported range -- hard block if below minimum
	if (!satisfies(parsed, OPENCODE_COMPAT.supported)) {
		return {
			installed: true,
			version,
			path: binaryPath,
			compatible: false,
			compatibility: "too-old",
			message: `OpenCode ${version} is too old. Palot requires ${OPENCODE_COMPAT.supported}.`,
		}
	}

	// Check tested range -- supported but newer than what we've tested against
	if (!satisfies(parsed, OPENCODE_COMPAT.tested)) {
		return {
			installed: true,
			version,
			path: binaryPath,
			compatible: true,
			compatibility: "too-new",
			message: `OpenCode ${version} is newer than tested. Palot is tested with ${OPENCODE_COMPAT.tested}. Some features may not work as expected.`,
		}
	}

	// Within the tested range -- fully compatible
	return {
		installed: true,
		version,
		path: binaryPath,
		compatible: true,
		compatibility: "ok",
		message: null,
	}
}

export const checkManagedRuntime = checkOpenCode
