/**
 * Shared server configuration constants.
 *
 * Used by both the main process and the renderer. Keep this module
 * free of Electron or React imports so it can be bundled in either context.
 */

import type { LocalServerConfig, ServerConfig, ServerSettings } from "@desktop/preload"

/** Legacy display names replaced on load when they no longer match the host OS. */
export const LEGACY_LOCAL_SERVER_NAMES = new Set([
	"This Mac",
	"This PC",
	"This Linux",
	"Local server",
])

/** Human-readable label for the built-in local OpenCode server on this machine. */
export function getLocalServerDisplayName(platform: NodeJS.Platform): string {
	switch (platform) {
		case "darwin":
			return "This Mac"
		case "win32":
			return "This PC"
		case "linux":
			return "This Linux"
		default:
			return "Local server"
	}
}

/** The built-in local server entry for the given platform. */
export function createDefaultLocalServer(platform: NodeJS.Platform): LocalServerConfig {
	return {
		id: "local",
		name: getLocalServerDisplayName(platform),
		type: "local",
	}
}

/** Default server settings for fresh installs on the given platform. */
export function createDefaultServerSettings(platform: NodeJS.Platform): ServerSettings {
	return {
		servers: [createDefaultLocalServer(platform)],
		activeServerId: "local",
	}
}

/** Platform-aware local server fallback (defaults to linux when platform is unknown). */
export function resolveDefaultLocalServer(platform?: NodeJS.Platform): LocalServerConfig {
	return createDefaultLocalServer(platform ?? "linux")
}

/** Platform-aware server settings fallback (defaults to linux when platform is unknown). */
export function resolveDefaultServerSettings(platform?: NodeJS.Platform): ServerSettings {
	return createDefaultServerSettings(platform ?? "linux")
}

/**
 * Generic fallback used before settings sync (browser mode / first paint).
 * Prefer {@link createDefaultLocalServer} with a real platform when available.
 */
export const DEFAULT_LOCAL_SERVER: LocalServerConfig = {
	id: "local",
	name: "Local server",
	type: "local",
}

/** @deprecated Use {@link createDefaultServerSettings} with `process.platform` in main, or `window.palot.platform` in renderer. */
export const DEFAULT_SERVER_SETTINGS: ServerSettings = {
	servers: [DEFAULT_LOCAL_SERVER],
	activeServerId: "local",
}

function isGrokOrUnsupportedServer(server: ServerConfig): boolean {
	const record = server as ServerConfig & { runtime?: string }
	const id = record.id.toLowerCase()
	const type = String(record.type).toLowerCase()
	const runtime = String(record.runtime ?? "").toLowerCase()

	// Legacy grok runtime entries (e.g. local-grok). Remote servers are not removed by display name alone.
	if (id.includes("grok") || type.includes("grok") || runtime.includes("grok")) {
		return true
	}

	return record.type !== "local" && record.type !== "remote" && record.type !== "ssh"
}

function normalizeLocalServer(
	entry: LocalServerConfig | undefined,
	platform: NodeJS.Platform,
): LocalServerConfig {
	const defaults = createDefaultLocalServer(platform)
	if (!entry || entry.id !== "local" || entry.type !== "local") {
		return defaults
	}

	const usePlatformName =
		LEGACY_LOCAL_SERVER_NAMES.has(entry.name) || /grok/i.test(entry.name)

	return {
		id: "local",
		name: usePlatformName ? defaults.name : entry.name,
		type: "local",
		hostname: entry.hostname,
		port: entry.port,
		hasPassword: entry.hasPassword,
		mdns: entry.mdns,
		mdnsDomain: entry.mdnsDomain,
	}
}

/**
 * Removes unsupported server entries (e.g. legacy `local-grok`) and ensures the
 * built-in local server uses the correct name for the host OS.
 */
export function sanitizeServerSettings(
	input: ServerSettings,
	platform: NodeJS.Platform,
): { settings: ServerSettings; changed: boolean } {
	let changed = false

	const filtered = input.servers.filter((server) => {
		if (isGrokOrUnsupportedServer(server)) {
			changed = true
			return false
		}
		return true
	})

	const localEntry = filtered.find(
		(s): s is LocalServerConfig => s.id === "local" && s.type === "local",
	)
	const normalizedLocal = normalizeLocalServer(localEntry, platform)
	const others = filtered.filter((s) => s.id !== "local")
	const servers: ServerConfig[] = [normalizedLocal, ...others]

	if (
		!localEntry ||
		localEntry.name !== normalizedLocal.name ||
		servers.length !== input.servers.length
	) {
		changed = true
	}

	let activeServerId = input.activeServerId
	if (!servers.some((s) => s.id === activeServerId)) {
		activeServerId = "local"
		changed = true
	}

	const settings: ServerSettings = { servers, activeServerId }

	if (
		!changed &&
		(settings.activeServerId !== input.activeServerId ||
			JSON.stringify(settings.servers) !== JSON.stringify(input.servers))
	) {
		changed = true
	}

	return { settings, changed }
}
