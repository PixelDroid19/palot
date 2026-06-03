/**
 * Claude Code provider adapter (Phase 2 placeholder).
 *
 * Implements the full AgentProviderAdapter interface from @palot/core.
 *
 * Safe no-ops for discovery; throws clear "not implemented (Phase 2)" on connect/dispatch.
 * Fully interface compliant for multi-provider hosts and tests today.
 * Will use @palot/configconv for history/agents/commands/permissions normalization.
 * Capability differences stay behind adapter metadata (never leak to core/UI).
 */

import type {
	AgentProviderAdapter,
	GetSessionInput,
	ListSessionsInput,
	PalotCommand,
	PalotEvent,
	ProviderConnection,
	ProviderConnectionInput,
	SessionInfo,
	WorkspaceInfo,
} from "@palot/core"

/**
 * ClaudeCodeAgentAdapter (Phase 2 placeholder).
 * Throws on live operations. Ready for wiring + future real impl using configconv + Claude protocol.
 */
export class ClaudeCodeAgentAdapter implements AgentProviderAdapter {
	readonly id = "claude-code"
	readonly label = "Claude Code"

	async connect(_input: ProviderConnectionInput): Promise<ProviderConnection> {
		throw new Error(
			"ClaudeCodeAgentAdapter.connect: not implemented (Phase 2). Use OpenCode adapter today.",
		)
	}

	async disconnect(): Promise<void> {
		// safe no-op
	}

	async listWorkspaces(): Promise<WorkspaceInfo[]> {
		return []
	}

	async listSessions(_input: ListSessionsInput): Promise<SessionInfo[]> {
		return []
	}

	async getSession(_input: GetSessionInput): Promise<SessionInfo | null> {
		return null
	}

	async dispatch(_command: PalotCommand): Promise<void> {
		// Accept dispatch without crashing. Future: map rename/prompt etc.
	}

	// biome-ignore lint/correctness/useYield: placeholder intentionally empty iterable (valid, non-hanging for host wiring/tests)
	async *events(_signal: AbortSignal): AsyncIterable<PalotEvent> {
		// Empty iterable is valid and non-crashing for hosts during early wiring.
		return
	}
}

export type {
	AgentProviderAdapter,
	GetSessionInput,
	ListSessionsInput,
	ProviderConnection,
	ProviderConnectionInput,
} from "@palot/core"
