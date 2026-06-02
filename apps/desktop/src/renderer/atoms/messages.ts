import { atom } from "jotai"
import { atomFamily } from "jotai-family"
import { binarySearchById, capMessageList, mergeMessagesById } from "@desktop/shared"
import { MAX_MESSAGES_PER_SESSION } from "@desktop/shared"
import type { Message, Part } from "../lib/types"
import { partsFamily } from "./parts"

// ============================================================
// Per-session message list (sorted by id)
// ============================================================

export const messagesFamily = atomFamily((_sessionId: string) => atom<Message[]>([]))

// ============================================================
// Action atoms
// ============================================================

/**
 * Set messages for a session (initial fetch + merge with existing SSE data).
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

		// Fast path: no existing messages — just set everything
		if (!existing || existing.length === 0) {
			set(messagesFamily(args.sessionId), args.messages)
			for (const [messageId, msgParts] of Object.entries(args.parts)) {
				set(partsFamily(messageId), msgParts)
			}
			return
		}

		const merged = mergeMessagesById(existing, args.messages)

		// Merge parts: fetched parts fill in gaps, SSE parts take priority
		for (const [messageId, fetchedParts] of Object.entries(args.parts)) {
			const existingParts = get(partsFamily(messageId))
			if (!existingParts || existingParts.length === 0) {
				// No SSE parts yet for this message — use fetched
				set(partsFamily(messageId), fetchedParts)
			}
			// Otherwise keep the SSE-accumulated parts (more recent)
		}

		set(messagesFamily(args.sessionId), merged)
	},
)

/**
 * Upsert a single message.
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
			// Clean up parts for the optimistic message
			set(partsFamily(optimisticId), [])
			existing = existing.filter((_, i) => i !== optimisticIndex)
		}
	}

	const result = binarySearchById(existing, message.id)

	if (result.found) {
		// Skip if reference-equal (no change)
		if (existing[result.index] === message) return

		const updated = existing.slice()
		updated[result.index] = message
		const capped = capMessageList(updated, MAX_MESSAGES_PER_SESSION)
		for (const removedId of capped.removedIds) {
			set(partsFamily(removedId), [])
		}
		set(messagesFamily(sessionId), capped.messages)
		return
	}

	const updated = existing.slice()
	updated.splice(result.index, 0, message)
	const capped = capMessageList(updated, MAX_MESSAGES_PER_SESSION)
	for (const removedId of capped.removedIds) {
		set(partsFamily(removedId), [])
	}
	set(messagesFamily(sessionId), capped.messages)
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
		const result = binarySearchById(existing, args.messageId)
		if (!result.found) return
		const updated = [...existing]
		updated.splice(result.index, 1)
		set(partsFamily(args.messageId), [])
		set(messagesFamily(args.sessionId), updated)
	},
)
