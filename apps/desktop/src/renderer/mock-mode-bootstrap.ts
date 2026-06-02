/**
 * Synchronous mock-mode hydration before React paint.
 *
 * Kept separate from use-mock-mode.ts to avoid importing connection-manager
 * at module load (circular deps / broken Vite graph in dev).
 */

import { isMockModeUrl } from "@desktop/shared"
import { serverConnectedAtom, serverUrlAtom } from "./atoms/connection"
import { discoveryAtom } from "./atoms/discovery"
import { messagesFamily } from "./atoms/messages"
import { partsFamily } from "./atoms/parts"
import { sessionFamily, sessionIdsAtom } from "./atoms/sessions"
import { appStore } from "./atoms/store"
import { sessionDiffFamily } from "./atoms/ui"
import {
	MOCK_DIFFS,
	MOCK_DISCOVERY,
	MOCK_MESSAGES,
	MOCK_PARTS,
	MOCK_SESSION_ENTRIES,
	MOCK_SESSION_IDS,
} from "./lib/mock-data"

export function hydrateMockMode(): void {
	appStore.set(discoveryAtom, MOCK_DISCOVERY)
	appStore.set(sessionIdsAtom, new Set(MOCK_SESSION_IDS))
	for (const [sessionId, entry] of MOCK_SESSION_ENTRIES) {
		appStore.set(sessionFamily(sessionId), entry)
	}
	for (const [sessionId, messages] of MOCK_MESSAGES) {
		appStore.set(messagesFamily(sessionId), messages)
	}
	for (const [, sessionParts] of MOCK_PARTS) {
		for (const [messageId, parts] of Object.entries(sessionParts)) {
			appStore.set(partsFamily(messageId), parts)
		}
	}
	for (const [sessionId, diffs] of MOCK_DIFFS) {
		appStore.set(sessionDiffFamily(sessionId), diffs)
	}
	appStore.set(serverUrlAtom, "http://mock-server:3100")
	appStore.set(serverConnectedAtom, true)
}

if (typeof window !== "undefined" && isMockModeUrl(window.location.href)) {
	hydrateMockMode()
}