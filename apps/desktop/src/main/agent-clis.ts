import { type CliDetection, createNodeHost, detectAll } from "@palot/cli-registry"
import { createLogger } from "./logger"

const log = createLogger("agent-clis")

const host = createNodeHost()

// Detection spawns a handful of `--version` probes; cache briefly so repeated
// settings-panel opens don't re-scan the PATH on every mount.
const CACHE_TTL_MS = 15_000
let cache: { at: number; result: CliDetection[] } | null = null

/**
 * Detect which coding-agent CLIs (OpenCode, Claude Code, Codex, Cursor, Gemini)
 * are installed on this machine, with their versions and auth state. Results are
 * cached for a short window to keep the UI responsive.
 */
export async function detectAgentClis(force = false): Promise<CliDetection[]> {
	const now = Date.now()
	if (!force && cache && now - cache.at < CACHE_TTL_MS) {
		return cache.result
	}
	const result = await detectAll(host)
	cache = { at: now, result }
	log.info("Detected agent CLIs", {
		installed: result.filter((r) => r.installed).map((r) => r.id),
	})
	return result
}
