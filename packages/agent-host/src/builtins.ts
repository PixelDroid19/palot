/**
 * Optional built-in process adapters. Embedders choose which to register —
 * the host never hard-codes brand tables outside this factory.
 */
import { ClaudeProvider } from "./providers/claude"
import { CodexProvider } from "./providers/codex"
import type { AgentSessionProvider, BuiltInProviderId } from "./types"

export const ALL_BUILTIN_PROVIDER_IDS: BuiltInProviderId[] = ["codex", "claude"]

/**
 * Create built-in process providers. Pass a subset of ids to ship without
 * Codex and/or Claude (e.g. only a custom harness + one CLI).
 */
export function createBuiltInProviders(
	resolveBinary: (binary: string) => Promise<string | null>,
	which: readonly BuiltInProviderId[] = ALL_BUILTIN_PROVIDER_IDS,
): AgentSessionProvider[] {
	const providers: AgentSessionProvider[] = []
	for (const id of which) {
		if (id === "codex") {
			providers.push(new CodexProvider(() => resolveBinary("codex")))
		} else if (id === "claude") {
			providers.push(new ClaudeProvider(() => resolveBinary("claude")))
		}
	}
	return providers
}
