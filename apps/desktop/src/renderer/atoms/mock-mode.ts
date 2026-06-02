import { atom } from "jotai"
import { atomWithStorage } from "jotai/utils"
import { isMockModeUrl } from "@desktop/shared"

// ============================================================
// Mock mode state
// ============================================================

/**
 * Persisted toggle for demo/mock mode.
 * When true, the app uses static fixture data instead of connecting
 * to the OpenCode server. Used for screenshots and marketing.
 */
export const mockModeStorageAtom = atomWithStorage<boolean>("palot:mockMode", false)

function hasMockUrlParam(): boolean {
	if (typeof window === "undefined") return false
	return isMockModeUrl(window.location.href)
}

/**
 * Derived read atom: true if mock mode is active (via storage OR URL param).
 */
export const isMockModeAtom = atom((get) => {
	return get(mockModeStorageAtom) || hasMockUrlParam()
})

/**
 * Write-only toggle atom for the command palette.
 */
export const toggleMockModeAtom = atom(null, (get, set) => {
	set(mockModeStorageAtom, !get(mockModeStorageAtom))
})
