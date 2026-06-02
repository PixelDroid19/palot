/**
 * Pure message-list helpers (testable without Jotai).
 */

import { MAX_MESSAGES_PER_SESSION } from "./scale-limits"

export type Identifiable = { id: string }

/**
 * Binary search for sorted arrays. Returns { found, index }.
 */
export function binarySearchById<T extends Identifiable>(arr: T[], targetId: string): {
	found: boolean
	index: number
} {
	let lo = 0
	let hi = arr.length
	while (lo < hi) {
		const mid = (lo + hi) >>> 1
		const cmp = arr[mid].id.localeCompare(targetId)
		if (cmp < 0) lo = mid + 1
		else if (cmp > 0) hi = mid
		else return { found: true, index: mid }
	}
	return { found: false, index: lo }
}

/** Drop oldest entries when over the session message cap. Returns removed ids. */
export function capMessageList<T extends Identifiable>(
	messages: T[],
	max = MAX_MESSAGES_PER_SESSION,
): { messages: T[]; removedIds: string[] } {
	if (messages.length <= max) {
		return { messages, removedIds: [] }
	}
	const overflow = messages.length - max
	const removedIds = messages.slice(0, overflow).map((m) => m.id)
	return { messages: messages.slice(overflow), removedIds }
}

/** Merge fetched messages into existing SSE-backed list (prefer existing for duplicates). */
export function mergeMessagesById<T extends Identifiable>(existing: T[], incoming: T[]): T[] {
	if (existing.length === 0) return incoming.slice()
	const existingIds = new Set(existing.map((m) => m.id))
	const merged = existing.slice()
	for (const msg of incoming) {
		if (!existingIds.has(msg.id)) {
			const result = binarySearchById(merged, msg.id)
			merged.splice(result.index, 0, msg)
		}
	}
	return merged
}