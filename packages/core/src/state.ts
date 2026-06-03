/**
 * Root CoreState composition and top-level reducer.
 *
 * Composes the domain slices (sessions/messages, automations, settings, workspaces,
 * plus provider connection for completeness).
 *
 * All reducers are pure. Use replayEventsIntoReducer from @palot/events for tests.
 *
 * This is the single source of truth shape for view model derivation.
 * Diff support now included via sessions slice.
 */

import type { PalotEvent, ProviderConnectedEvent, ProviderDisconnectedEvent } from "@palot/events"
import { type AutomationState, automationsReducer, initialAutomationsState } from "./automations"
import {
	initialCoreState as initialSessionsState,
	type CoreState as SessionsCoreState,
	sessionLifecycleReducer,
} from "./sessions"
import { initialSettingsState, type SettingsState, settingsReducer } from "./settings"
import { initialWorkspacesState, type WorkspacesState, workspacesReducer } from "./workspaces"

export interface ProviderConnectionState {
	connectedProviderId?: string
	lastConnectedAt?: number
	lastDisconnectedAt?: number
	lastDisconnectReason?: string
}

export interface FullCoreState {
	sessions: SessionsCoreState
	automations: AutomationState
	settings: SettingsState
	workspaces: WorkspacesState
	provider: ProviderConnectionState
}

export const initialFullCoreState: FullCoreState = {
	sessions: initialSessionsState,
	automations: initialAutomationsState,
	settings: initialSettingsState,
	workspaces: initialWorkspacesState,
	provider: {},
}

function applyProviderEvent(state: FullCoreState, event: PalotEvent): FullCoreState {
	if (event.type === "provider.connected") {
		const e = event as ProviderConnectedEvent
		return {
			...state,
			provider: {
				connectedProviderId: e.providerId,
				lastConnectedAt: e.at,
			},
		}
	}
	if (event.type === "provider.disconnected") {
		const e = event as ProviderDisconnectedEvent
		return {
			...state,
			provider: {
				...state.provider,
				connectedProviderId: undefined,
				lastDisconnectedAt: e.at,
				lastDisconnectReason: e.reason,
			},
		}
	}
	return state
}

/**
 * Top level reducer. Applies event to all relevant slices.
 * Order: provider first (for connection), then domain.
 * Use for full replay: replayEventsIntoReducer(events, initialFullCoreState, rootReducer)
 */
export function rootReducer(state: FullCoreState, event: PalotEvent): FullCoreState {
	let next = applyProviderEvent(state, event)
	next = {
		...next,
		sessions: sessionLifecycleReducer(next.sessions, event),
		automations: automationsReducer(next.automations, event),
		settings: settingsReducer(next.settings, event),
		workspaces: workspacesReducer(next.workspaces, event),
	}
	return next
}
