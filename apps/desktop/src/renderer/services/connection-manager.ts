/**
 * Minimal OpenCode client connection pool — no React/Jotai.
 */
import type { OpencodeClient } from "@opencode-ai/sdk/v2/client"
import { connectToServer } from "./project-runtime-sdk"

let baseClient: OpencodeClient | null = null
let baseUrl: string | null = null
const projectClients = new Map<string, OpencodeClient>()

export function getBaseClient(): OpencodeClient | null {
	return baseClient
}

export function getProjectClient(directory: string): OpencodeClient | null {
	return projectClients.get(directory) ?? baseClient
}

export function setBaseClient(url: string, client: OpencodeClient): void {
	baseUrl = url
	baseClient = client
}

export function setProjectClient(directory: string, client: OpencodeClient): void {
	projectClients.set(directory, client)
}

export function clearClients(): void {
	baseClient = null
	baseUrl = null
	projectClients.clear()
}

export function getBaseUrl(): string | null {
	return baseUrl
}

/** Ensure a base client exists for the given server URL. */
export function ensureBaseClient(url: string): OpencodeClient {
	if (baseClient && baseUrl === url) return baseClient
	const client = connectToServer(url)
	setBaseClient(url, client)
	return client
}
