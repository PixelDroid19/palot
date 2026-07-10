/**
 * Legacy OpenCode SDK entrypoint. OpenCode is now driven through ACP and the
 * Lit product must never create or attach to an HTTP server for auxiliary data.
 */

export async function ensureRuntimeClient(): Promise<never> {
	throw new Error("OpenCode HTTP integrations are unavailable; use the agent-session CLI runtime")
}
