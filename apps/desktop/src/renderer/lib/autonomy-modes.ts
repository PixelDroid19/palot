/**
 * Execution / autonomy modes (plan → confirm → auto-edit → full-access).
 *
 * Maps product-facing modes onto {@link AgentSandbox} so every harness shares
 * the same permission grammar. At least three distinct levels are required,
 * including plan-first and confirm-before-write.
 */
import type { AgentSandbox } from "../../preload/api"

/** Product autonomy mode ids (stable for prefs / tests). */
export type AutonomyModeId = "plan" | "confirm" | "auto-edit" | "full-access"

export interface AutonomyModeDefinition {
	id: AutonomyModeId
	/** Short label for the toolbar. */
	label: string
	/** One-line guidance for the user. */
	description: string
	/** Host/agent-host sandbox posture. */
	sandbox: AgentSandbox
	/**
	 * Policy intent:
	 * - plan-first: research and propose; no writes until approved
	 * - confirm-before-write: asks before file/shell side effects
	 * - auto-edit: file edits freer; shell still gated by the host
	 * - continuous: reduced interruptions for clear low-risk work
	 */
	policy: "plan-first" | "confirm-before-write" | "auto-edit" | "continuous"
}

/**
 * Full ladder (Default maps to confirm for safe everyday use).
 * Ordered by increasing autonomy / risk.
 */
export const AUTONOMY_MODES: readonly AutonomyModeDefinition[] = [
	{
		id: "plan",
		label: "Plan mode",
		description: "Research and plan first; no file or shell changes until you approve.",
		sandbox: "plan",
		policy: "plan-first",
	},
	{
		id: "confirm",
		label: "Confirm before changes",
		description: "Ask before each file edit or command.",
		sandbox: "read-only",
		policy: "confirm-before-write",
	},
	{
		id: "auto-edit",
		label: "Auto edit",
		description: "Apply workspace file edits with fewer interruptions; shell stays gated.",
		sandbox: "workspace-write",
		policy: "auto-edit",
	},
	{
		id: "full-access",
		label: "Full access",
		description: "Fewer interruptions for clear, lower-risk tasks (still host-gated tools).",
		sandbox: "danger-full-access",
		policy: "continuous",
	},
] as const

export function listAutonomyModes(): readonly AutonomyModeDefinition[] {
	return AUTONOMY_MODES
}

export function getAutonomyMode(id: AutonomyModeId): AutonomyModeDefinition {
	const found = AUTONOMY_MODES.find((m) => m.id === id)
	if (!found) throw new Error(`Unknown autonomy mode: ${id}`)
	return found
}

/** Product mode → wire sandbox. */
export function autonomyModeToSandbox(id: AutonomyModeId): AgentSandbox {
	return getAutonomyMode(id).sandbox
}

/** Wire sandbox → product mode (unknown → confirm). */
export function sandboxToAutonomyMode(sandbox: AgentSandbox): AutonomyModeId {
	const found = AUTONOMY_MODES.find((m) => m.sandbox === sandbox)
	return found?.id ?? "confirm"
}

/** True when the mode is plan-first (no writes until approval). */
export function isPlanFirstMode(id: AutonomyModeId): boolean {
	return getAutonomyMode(id).policy === "plan-first"
}

/** True when the mode requires confirm-before-write semantics. */
export function isConfirmBeforeWriteMode(id: AutonomyModeId): boolean {
	return getAutonomyMode(id).policy === "confirm-before-write"
}

/**
 * Cycle modes (Shift+Tab style). Starts from current and steps forward.
 */
export function cycleAutonomyMode(current: AutonomyModeId, delta = 1): AutonomyModeId {
	const idx = AUTONOMY_MODES.findIndex((m) => m.id === current)
	const i = idx < 0 ? 0 : idx
	const next = (i + delta + AUTONOMY_MODES.length) % AUTONOMY_MODES.length
	return AUTONOMY_MODES[next]!.id
}
