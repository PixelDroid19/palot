/**
 * Settings reducer (minimal).
 *
 * Core does not own persistence (shell via NativeShellPort or IPC does),
 * but tracks last-known values for view models and automation decisions.
 * Events of type settings.changed drive updates.
 * getSetting provides documented fallback.
 */

import type { PalotEvent } from "@palot/events"

export interface SettingsState {
	values: Record<string, unknown>
	lastChangedAt: Record<string, number>
}

export const initialSettingsState: SettingsState = {
	values: {},
	lastChangedAt: {},
}

export function settingsReducer(state: SettingsState, event: PalotEvent): SettingsState {
	if (event.type !== "settings.changed") {
		return state
	}
	const e = event as Extract<PalotEvent, { type: "settings.changed" }>
	const payload = e.payload ?? (e.value !== undefined && e.key ? { [e.key]: e.value } : {})
	const key = e.key
	if (!key) {
		// bulk replace for simplicity in tests
		const lastChanged: Record<string, number> = {}
		for (const k of Object.keys(payload)) {
			lastChanged[k] = event.at
		}
		return {
			values: { ...payload },
			lastChangedAt: lastChanged,
		}
	}
	return {
		values: { ...state.values, [key]: e.value ?? payload[key] },
		lastChangedAt: { ...state.lastChangedAt, [key]: event.at },
	}
}

/**
 * Get a setting value with optional documented fallback.
 * Defaults only at this boundary as specified.
 */
export function getSetting<T = unknown>(
	state: SettingsState,
	key: string,
	fallback?: T,
): T | undefined {
	return (state.values[key] as T) ?? fallback
}
