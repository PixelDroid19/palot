/**
 * Unread/new-activity tracking for sidebar sessions (#128). A session becomes
 * unread when it finishes working (busy → idle) while the user is looking at
 * a different session; navigating to it clears the mark.
 */
import { atom } from "jotai"

/** Session id currently open in the detail view (null on other screens). */
export const viewedSessionAtom = atom<string | null>(null)

/** Ids of sessions with activity the user hasn't seen yet. */
export const unreadSessionsAtom = atom<ReadonlySet<string>>(new Set<string>())

export const markSessionUnreadAtom = atom(null, (get, set, sessionId: string) => {
	const current = get(unreadSessionsAtom)
	if (current.has(sessionId)) return
	const next = new Set(current)
	next.add(sessionId)
	set(unreadSessionsAtom, next)
})

export const clearSessionUnreadAtom = atom(null, (get, set, sessionId: string) => {
	const current = get(unreadSessionsAtom)
	if (!current.has(sessionId)) return
	const next = new Set(current)
	next.delete(sessionId)
	set(unreadSessionsAtom, next)
})
