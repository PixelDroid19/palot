import { atom } from "jotai"
import { atomWithStorage } from "jotai/utils"
import type { WindowChromeTier } from "../../preload/api"
import type { ColorScheme } from "../lib/themes"

// ============================================================
// Types
// ============================================================

export type DisplayMode = "default" | "verbose"

export interface PersistedModelRef {
	providerID: string
	modelID: string
	variant?: string
	agent?: string
}

// ============================================================
// One-time migration from Zustand persist to Jotai atomWithStorage
// ============================================================

function migrateFromZustandPersist(): void {
	const oldKey = "palot-preferences"
	const raw = localStorage.getItem(oldKey)
	if (!raw) return

	try {
		const { state } = JSON.parse(raw) // Zustand persist wraps in { state, version }
		if (state.displayMode)
			localStorage.setItem("gcode:displayMode", JSON.stringify(state.displayMode))
		if (state.theme) localStorage.setItem("gcode:theme", JSON.stringify(state.theme))
		if (state.colorScheme)
			localStorage.setItem("gcode:colorScheme", JSON.stringify(state.colorScheme))
		if (state.drafts) localStorage.setItem("gcode:drafts", JSON.stringify(state.drafts))
		if (state.projectModels)
			localStorage.setItem("gcode:runtimeSelections", JSON.stringify(state.projectModels))

		// Remove old key after successful migration
		localStorage.removeItem(oldKey)
	} catch {
		// Ignore malformed data
	}
}

/** Copy a single localStorage key from legacy Palot prefix if the GCode key is empty. */
function migrateStorageKey(from: string, to: string): void {
	if (localStorage.getItem(to) != null) return
	const legacy = localStorage.getItem(from)
	if (legacy == null) return
	localStorage.setItem(to, legacy)
	localStorage.removeItem(from)
}

/** One-time Palot → GCode localStorage key migration (product rebrand). */
function migratePalotStorageKeys(): void {
	const pairs: Array<[string, string]> = [
		["palot:displayMode", "gcode:displayMode"],
		["palot:theme", "gcode:theme"],
		["palot:colorScheme", "gcode:colorScheme"],
		["palot:drafts", "gcode:drafts"],
		["palot:runtimeSelections", "gcode:runtimeSelections"],
		["palot:projectModels", "gcode:runtimeSelections"],
		["palot:opaqueWindows", "gcode:opaqueWindows"],
		["palot:automationsBannerDismissed", "gcode:automationsBannerDismissed"],
		["palot:onboarding", "gcode:onboarding"],
		["palot:hiddenProjects", "gcode:hiddenProjects"],
		["palot:locale", "gcode:locale"],
		["palot:mockMode", "gcode:mockMode"],
		["palot:automationsEnabled", "gcode:automationsEnabled"],
		["palot:reactScan", "gcode:reactScan"],
		["palot:review-panel-settings", "gcode:review-panel-settings"],
		["palot:cliSessions", "gcode:cliSessions"],
		["palot:cliRuntimePrefs", "gcode:cliRuntimePrefs"],
		["palot:lastSessionRuntime", "gcode:lastSessionRuntime"],
	]
	for (const [from, to] of pairs) migrateStorageKey(from, to)
	// CLI session bodies used a prefix
	for (let i = 0; i < localStorage.length; i++) {
		const key = localStorage.key(i)
		if (!key?.startsWith("palot:cliSession:")) continue
		const next = key.replace(/^palot:/, "gcode:")
		migrateStorageKey(key, next)
	}
}

// Run migration at module load time (before any atoms are read)
migrateFromZustandPersist()
migratePalotStorageKeys()

// Migrate removed "compact" display mode to "default"
function migrateDisplayMode(): void {
	const raw = localStorage.getItem("gcode:displayMode")
	if (raw === '"compact"') {
		localStorage.setItem("gcode:displayMode", '"default"')
	}
}
migrateDisplayMode()

function migrateRuntimeSelectionsKey(): void {
	// Older GCode builds used gcode:projectModels before runtimeSelections rename
	const legacyKey = "gcode:projectModels"
	const nextKey = "gcode:runtimeSelections"
	const next = localStorage.getItem(nextKey)
	if (next) return
	const legacy = localStorage.getItem(legacyKey)
	if (!legacy) return
	localStorage.setItem(nextKey, legacy)
	localStorage.removeItem(legacyKey)
}
migrateRuntimeSelectionsKey()

// ============================================================
// Persisted atoms — each is independent with its own localStorage key
// ============================================================

export const displayModeAtom = atomWithStorage<DisplayMode>("gcode:displayMode", "default")

export const themeAtom = atomWithStorage<string>("gcode:theme", "default")

export const colorSchemeAtom = atomWithStorage<ColorScheme>("gcode:colorScheme", "dark")

/**
 * Whether the user prefers opaque (non-transparent) windows.
 * When true, the renderer uses solid backgrounds instead of semi-transparent.
 */
export const opaqueWindowsAtom = atomWithStorage<boolean>("gcode:opaqueWindows", false)

/**
 * The active window chrome tier, set by the main process on load.
 * "liquid-glass" = macOS 26+, "vibrancy" = older macOS, "opaque" = non-macOS or user pref.
 * Defaults to "opaque" for browser-mode dev (no Electron).
 */
export const chromeTierAtom = atom<WindowChromeTier>("opaque")

/**
 * Whether the window has any form of transparency (liquid glass or vibrancy).
 * Used by CSS to decide between semi-transparent and solid backgrounds.
 */
export const isTransparentAtom = atom((get) => {
	const tier = get(chromeTierAtom)
	const opaque = get(opaqueWindowsAtom)
	return !opaque && (tier === "liquid-glass" || tier === "vibrancy")
})

export const draftsAtom = atomWithStorage<Record<string, string>>("gcode:drafts", {})

export const runtimeSelectionsAtom = atomWithStorage<Record<string, PersistedModelRef>>(
	"gcode:runtimeSelections",
	{},
)

/**
 * Whether the user has dismissed the automations permissions info banner.
 * Once dismissed, the banner never reappears.
 */
export const automationsBannerDismissedAtom = atomWithStorage<boolean>(
	"gcode:automationsBannerDismissed",
	false,
)

// ============================================================
// Derived atoms for drafts
// ============================================================

/** Read a draft for a specific key */
export const readDraftAtom = (key: string) => atom((get) => get(draftsAtom)[key] ?? "")

/** Set a draft for a specific key (write-only action atom) */
export const setDraftAtom = atom(null, (get, set, args: { key: string; text: string }) => {
	const drafts = { ...get(draftsAtom) }
	if (args.text) {
		drafts[args.key] = args.text
	} else {
		delete drafts[args.key]
	}
	set(draftsAtom, drafts)
})

/** Clear a draft (write-only action atom) */
export const clearDraftAtom = atom(null, (get, set, key: string) => {
	const drafts = { ...get(draftsAtom) }
	delete drafts[key]
	set(draftsAtom, drafts)
})

/** Set a persisted runtime selection for a directory (write-only action atom) */
export const setRuntimeSelectionAtom = atom(
	null,
	(
		get,
		set,
		args: {
			directory: string
			model: PersistedModelRef
		},
	) => {
		const runtimeSelections = { ...get(runtimeSelectionsAtom) }
		runtimeSelections[args.directory] = {
			providerID: args.model.providerID,
			modelID: args.model.modelID,
			variant: args.model.variant,
			agent: args.model.agent,
		}
		set(runtimeSelectionsAtom, runtimeSelections)
	},
)
