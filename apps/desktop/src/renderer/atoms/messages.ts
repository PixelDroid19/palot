import { atom } from "jotai"
import { atomFamily } from "jotai-family"
import type { Message, Part } from "../lib/types"
import { partsFamily } from "./parts"

// ============================================================
// Helpers — chronological ordering (not id string order)
// ============================================================

const MAX_MESSAGES_PER_SESSION = 200

/**
 * Creation time for ordering. Missing / invalid times sort as 0 so they land
 * at the top rather than scrambling the rest of the conversation.
 */
export function messageCreatedAt(message: Pick<Message, "time">): number {
	const created = message.time?.created
	return typeof created === "number" && Number.isFinite(created) ? created : 0
}

/**
 * Pure chronological compare: oldest first (ascending time.created).
 * Tie-break on id only so order is stable across heterogeneous id namespaces
 * (OpenCode server ids, `cli-${ts}-*`, optimistic-*).
 */
export function compareMessagesChronological(
	a: Pick<Message, "id" | "time">,
	b: Pick<Message, "id" | "time">,
): number {
	const ta = messageCreatedAt(a)
	const tb = messageCreatedAt(b)
	if (ta !== tb) return ta - tb
	return a.id.localeCompare(b.id)
}

/** Sort a message array oldest → newest (returns a new array). */
export function sortMessagesChronological(messages: Message[]): Message[] {
	return messages.slice().sort(compareMessagesChronological)
}

/**
 * Binary search for insert position by chronological order.
 * When looking up by id, use {@link findMessageIndexById} instead — the list
 * is not ordered by id string.
 */
function binarySearchChronological(
	arr: Message[],
	message: Pick<Message, "id" | "time">,
): { found: boolean; index: number } {
	let lo = 0
	let hi = arr.length
	while (lo < hi) {
		const mid = (lo + hi) >>> 1
		const cmp = compareMessagesChronological(arr[mid], message)
		if (cmp < 0) lo = mid + 1
		else if (cmp > 0) hi = mid
		else return { found: true, index: mid }
	}
	// Same timestamp + different id: linear scan for exact id near insert point is not needed;
	// found is only true when compare returns 0 (same time AND same id).
	return { found: false, index: lo }
}

/** Linear lookup by id (list is ordered by time, not by id). */
export function findMessageIndexById(arr: Message[], messageId: string): number {
	return arr.findIndex((m) => m.id === messageId)
}

// ============================================================
// Per-session message list (sorted oldest → newest by time.created)
// ============================================================

export const messagesFamily = atomFamily((_sessionId: string) => atom<Message[]>([]))

// ============================================================
// Action atoms
// ============================================================

/**
 * Set messages for a session (initial fetch + merge with existing SSE data).
 * Always stores in chronological order.
 */
export const setMessagesAtom = atom(
	null,
	(
		get,
		set,
		args: {
			sessionId: string
			messages: Message[]
			parts: Record<string, Part[]>
		},
	) => {
		const existing = get(messagesFamily(args.sessionId))

		// Fast path: no existing messages — sort then set
		if (!existing || existing.length === 0) {
			set(messagesFamily(args.sessionId), sortMessagesChronological(args.messages))
			for (const [messageId, msgParts] of Object.entries(args.parts)) {
				set(partsFamily(messageId), msgParts)
			}
			return
		}

		// Merge: keep existing (SSE) when ids collide; insert new by time.
		const existingIds = new Set(existing.map((m) => m.id))
		const merged = existing.slice()
		for (const msg of args.messages) {
			if (existingIds.has(msg.id)) continue
			const result = binarySearchChronological(merged, msg)
			merged.splice(result.index, 0, msg)
		}

		// Merge parts: fetched parts fill in gaps, SSE parts take priority
		for (const [messageId, fetchedParts] of Object.entries(args.parts)) {
			const existingParts = get(partsFamily(messageId))
			if (!existingParts || existingParts.length === 0) {
				set(partsFamily(messageId), fetchedParts)
			}
		}

		set(messagesFamily(args.sessionId), merged)
	},
)

/**
 * Upsert a single message, keeping the session list chronological.
 */
export const upsertMessageAtom = atom(null, (get, set, message: Message) => {
	const sessionId = message.sessionID
	let existing = get(messagesFamily(sessionId))

	// When a real user message arrives, remove the oldest optimistic placeholder.
	if (message.role === "user" && !message.id.startsWith("optimistic-")) {
		const optimisticIndex = existing.findIndex(
			(m) => m.id.startsWith("optimistic-") && m.role === "user",
		)
		if (optimisticIndex !== -1) {
			const optimisticId = existing[optimisticIndex].id
			set(partsFamily(optimisticId), [])
			existing = existing.filter((_, i) => i !== optimisticIndex)
		}
	}

	const existingIndex = findMessageIndexById(existing, message.id)

	if (existingIndex !== -1) {
		if (existing[existingIndex] === message) return

		const updated = existing.slice()
		const previous = updated[existingIndex]
		// If time.created changed, re-insert chronologically; otherwise replace in place.
		const timeChanged = messageCreatedAt(previous) !== messageCreatedAt(message)
		if (!timeChanged) {
			updated[existingIndex] = message
		} else {
			updated.splice(existingIndex, 1)
			const insert = binarySearchChronological(updated, message)
			updated.splice(insert.index, 0, message)
		}
		if (updated.length > MAX_MESSAGES_PER_SESSION) {
			const removed = updated.shift()!
			set(partsFamily(removed.id), [])
		}
		set(messagesFamily(sessionId), updated)
		return
	}

	const updated = existing.slice()
	const insert = binarySearchChronological(updated, message)
	updated.splice(insert.index, 0, message)
	if (updated.length > MAX_MESSAGES_PER_SESSION) {
		const removed = updated.shift()!
		set(partsFamily(removed.id), [])
	}
	set(messagesFamily(sessionId), updated)
})

/**
 * Remove a message from a session.
 */
export const removeMessageAtom = atom(
	null,
	(
		get,
		set,
		args: {
			sessionId: string
			messageId: string
		},
	) => {
		const existing = get(messagesFamily(args.sessionId))
		if (!existing) return
		const index = findMessageIndexById(existing, args.messageId)
		if (index === -1) return
		const updated = [...existing]
		updated.splice(index, 1)
		set(partsFamily(args.messageId), [])
		set(messagesFamily(args.sessionId), updated)
	},
)
