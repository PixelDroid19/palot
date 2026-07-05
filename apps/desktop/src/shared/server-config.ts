/**
 * Shared server configuration constants.
 *
 * Used by both the main process and the renderer. Keep this module
 * free of Electron or React imports so it can be bundled in either context.
 */

import type { LocalServerConfig, ServerSettings } from "../preload/api"

/** Platform-appropriate label for the built-in local server (#63). */
function localServerName(): string {
	// Main process / preload have `process`; the renderer falls back to the UA.
	const platform =
		typeof process !== "undefined" && process.platform
			? process.platform
			: typeof navigator !== "undefined" && /win/i.test(navigator.platform)
				? "win32"
				: typeof navigator !== "undefined" && /mac/i.test(navigator.platform)
					? "darwin"
					: "linux"
	if (platform === "darwin") return "This Mac"
	if (platform === "win32") return "This PC"
	return "This computer"
}

/** The built-in local server entry. Always present, cannot be deleted. */
export const DEFAULT_LOCAL_SERVER: LocalServerConfig = {
	id: "local",
	name: localServerName(),
	type: "local",
}

/**
 * Stale persisted names from builds that hardcoded "This Mac" everywhere are
 * treated as unedited and re-labelled for the current platform.
 */
export function normalizeLocalServerName(name: string): string {
	const defaults = ["This Mac", "This PC", "This computer"]
	return defaults.includes(name) ? localServerName() : name
}

/** Default server settings for fresh installs. */
export const DEFAULT_SERVER_SETTINGS: ServerSettings = {
	servers: [DEFAULT_LOCAL_SERVER],
	activeServerId: "local",
}
