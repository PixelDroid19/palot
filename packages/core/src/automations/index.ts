/**
 * Automations reducer.
 *
 * Tracks AutomationRunInfo state transitions from events.
 * Pure. Used by core and harness tests for automation flows.
 * See also use-cases for decisions.
 */

import type { AutomationRunInfo, PalotEvent } from "@palot/events"

export interface AutomationState {
	runs: Record<string, AutomationRunInfo>
}

export const initialAutomationsState: AutomationState = {
	runs: {},
}

export function automationsReducer(state: AutomationState, event: PalotEvent): AutomationState {
	if (event.type !== "automation.run.updated") {
		return state
	}
	const run = event.run
	return {
		...state,
		runs: {
			...state.runs,
			[run.id]: { ...run },
		},
	}
}

/**
 * Get runs for a specific automation.
 * Sorted by startedAt.
 */
export function getRunsForAutomation(
	state: AutomationState,
	automationId: string,
): AutomationRunInfo[] {
	return Object.values(state.runs)
		.filter((r) => r.automationId === automationId)
		.sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0))
}

/**
 * Get actionable (running or pending) runs.
 * Used by view models and automation decision use-cases.
 */
export function getActiveRuns(state: AutomationState): AutomationRunInfo[] {
	return Object.values(state.runs).filter((r) => r.status === "pending" || r.status === "running")
}
