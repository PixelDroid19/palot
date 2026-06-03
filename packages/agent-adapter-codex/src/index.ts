/**
 * Codex provider adapter (Phase 2 placeholder).
 *
 * Implements the full AgentProviderAdapter interface from @palot/core for
 * future multi-provider support.
 *
 * All methods either no-op safely or throw with clear "not implemented (Phase 2)" messages.
 * Fully interface-compliant (from @palot/core) so that multi-adapter hosts, harness, and
 * UI code can select/register it today without runtime surprises.
 *
 * Future: map Codex sessions, messages, tool calls, approvals, status changes into
 * canonical PalotEvent / dispatch PalotCommand. Never leak Codex types. Auth state
 * must surface via provider.connection events.
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
 * CodexAgentAdapter (Phase 2 placeholder).
 * Throws on operations requiring a real Codex backend. Safe for wiring today.
 */
export class CodexAgentAdapter implements AgentProviderAdapter {
	readonly id = "codex"
	readonly label = "Codex"

	async connect(_input: ProviderConnectionInput): Promise<ProviderConnection> {
		throw new Error(
			"CodexAgentAdapter.connect: not implemented (Phase 2). Register OpenCodeAdapter for current functionality.",
		)
	}

	async disconnect(): Promise<void> {
		// no-op for placeholder (safe)
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
		// Accept any command shape (no crash). Real impl will translate e.g. prompt.
		// For now, no-op is interface compliant.
	}

	// biome-ignore lint/correctness/useYield: placeholder intentionally empty iterable (valid, non-hanging for host wiring/tests)
	async *events(_signal: AbortSignal): AsyncIterable<PalotEvent> {
		// Yield nothing; a real impl would map ... -> PalotEvent[]
		return
	}
}

// Re-export the shared interface for consumers who want "import from codex adapter"
export type {
	AgentProviderAdapter,
	GetSessionInput,
	ListSessionsInput,
	ProviderConnection,
	ProviderConnectionInput,
} from "@palot/core"
