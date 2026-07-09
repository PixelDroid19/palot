/**
 * Ensure OpenCode base client is connected for plugins / worktree / usage.
 */
import { fetchRuntimeServerUrl } from "../services/backend"
import { ensureBaseClient, getBaseClient } from "../services/connection-manager"
import type { OpencodeClient } from "@opencode-ai/sdk/v2/client"

export async function ensureRuntimeClient(): Promise<OpencodeClient> {
	const existing = getBaseClient()
	if (existing) return existing
	const { url } = await fetchRuntimeServerUrl()
	if (!url) throw new Error("Managed runtime server is not available")
	return ensureBaseClient(url)
}
