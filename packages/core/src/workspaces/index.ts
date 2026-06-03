/**
 * Workspaces discovery reducer (thin).
 * Populated by workspace.discovered events.
 * Core keeps last known list for view models.
 * deriveProjectTreeViewModel builds on listWorkspaces.
 */

import type { PalotEvent, WorkspaceInfo } from "@palot/events"

export interface WorkspacesState {
	byId: Record<string, WorkspaceInfo>
	lastRefreshed?: number
}

export const initialWorkspacesState: WorkspacesState = {
	byId: {},
}

export function workspacesReducer(state: WorkspacesState, event: PalotEvent): WorkspacesState {
	if (event.type === "workspace.discovered") {
		return {
			byId: {
				...state.byId,
				[event.workspace.id]: { ...event.workspace },
			},
			lastRefreshed: Math.max(state.lastRefreshed ?? 0, event.at),
		}
	}
	// Could handle refresh command effects but commands are separate
	return state
}

/**
 * List all known workspaces.
 * Used by sidebar VM and project tree.
 */
export function listWorkspaces(state: WorkspacesState): WorkspaceInfo[] {
	return Object.values(state.byId)
}
