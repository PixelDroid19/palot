/**
 * Centralized eviction of per-session Jotai atomFamily entries.
 *
 * atomFamily creates atoms on demand and does not garbage-collect by default.
 * Call these helpers when sessions are deleted or when disconnecting from a server.
 */

import { agentFamily, sessionNameFamily } from "./derived/agents"
import {
	effectivePermissionFamily,
	effectiveQuestionFamily,
	sessionBlockedFamily,
	sessionDescendantIdsFamily,
} from "./derived/session-requests"
import { sessionMetricsFamily } from "./derived/session-metrics"
import { sessionSettingsAtom } from "./chat"
import { messagesFamily } from "./messages"
import { partsFamily } from "./parts"
import { sessionFamily } from "./sessions"
import { streamingVersionFamily } from "./streaming"
import { todosFamily } from "./todos"
import { diffFilterFamily, sessionDiffFamily, sessionDiffStatsFamily } from "./ui"

/** Remove all atomFamily state tied to a single session. */
export function evictSessionState(sessionId: string, messageIds: string[]): void {
	for (const messageId of messageIds) {
		partsFamily.remove(messageId)
	}
	messagesFamily.remove(sessionId)
	sessionFamily.remove(sessionId)
	streamingVersionFamily.remove(sessionId)
	todosFamily.remove(sessionId)
	sessionDiffFamily.remove(sessionId)
	diffFilterFamily.remove(sessionId)
	sessionDiffStatsFamily.remove(sessionId)
	sessionSettingsAtom.remove(sessionId)
	agentFamily.remove(sessionId)
	sessionNameFamily.remove(sessionId)
	sessionMetricsFamily.remove(sessionId)
	effectivePermissionFamily.remove(sessionId)
	effectiveQuestionFamily.remove(sessionId)
	sessionBlockedFamily.remove(sessionId)
	sessionDescendantIdsFamily.remove(sessionId)
}

