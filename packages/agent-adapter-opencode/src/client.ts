/**
 * Thin OpenCode client factory for the adapter.
 *
 * Keeps the adapter "pure" by accepting an optional custom fetch.
 * The desktop host (or browser) can supply the IPC-proxied fetch or auth'd fetch
 * via ProviderConnectionInput.
 *
 * Only used internally by OpenCodeAgentAdapter. Consumers never see SDK types.
 */

import type { OpencodeClient } from "@opencode-ai/sdk/v2/client"
import { createOpencodeClient } from "@opencode-ai/sdk/v2/client"

/**
 * Fetch signature accepted by SDK (avoids strict typeof fetch issues).
 */
export type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export interface CreateClientOptions {
	url: string
	directory?: string
	authHeader?: string | null
	fetch?: FetchFn
}

/**
 * Create a v2 SDK client.
 * If custom fetch provided, it is wrapped with minimal retry for transient errors
 * (mirrors the pattern in apps/desktop/src/renderer/services/opencode.ts but
 * without Electron/window dependencies inside the adapter).
 */
export function createOpenCodeClient(opts: CreateClientOptions): OpencodeClient {
	const { url, directory, authHeader, fetch: customFetch } = opts

	let baseFetch: FetchFn = customFetch ?? (globalThis.fetch as FetchFn)

	if (authHeader) {
		const orig = baseFetch
		baseFetch = async (input, init) => {
			const req = input instanceof Request ? input : new Request(input, init)
			const headers = new Headers(req.headers)
			headers.set("Authorization", authHeader)
			return orig(new Request(req, { headers }), init)
		}
	}

	// Minimal transient retry wrapper (same spirit as desktop, no Node/Electron)
	const retryFetch: FetchFn = async (input, init) => {
		let lastErr: unknown
		for (let attempt = 0; attempt <= 1; attempt++) {
			try {
				return await baseFetch(input, init)
			} catch (err) {
				lastErr = err
				const msg = String(err).toLowerCase()
				if (attempt < 1 && (msg.includes("fetch") || msg.includes("network"))) {
					await new Promise((r) => setTimeout(r, 150 * (attempt + 1)))
					continue
				}
				throw err
			}
		}
		throw lastErr
	}

	return createOpencodeClient({
		baseUrl: url,
		directory,
		fetch: retryFetch as typeof fetch,
	})
}
