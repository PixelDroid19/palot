/**
 * Ensure OpenCode base client is connected for Lit plugins / worktree / usage.
 * Uses the product connection-manager (same path as React shell).
 */
import type { OpencodeClient } from "@opencode-ai/sdk/v2/client"
import { fetchRuntimeServerUrl } from "../services/backend"
import {
	connectToProjectRuntime,
	getBaseClient,
} from "../services/connection-manager"

export async function ensureRuntimeClient(): Promise<OpencodeClient> {
	const existing = getBaseClient()
	if (existing) return existing
	const { url } = await fetchRuntimeServerUrl()
	if (!url) throw new Error("Managed runtime server is not available")
	await connectToProjectRuntime(url)
	const client = getBaseClient()
	if (!client) throw new Error("Failed to connect managed runtime client")
	return client
}
