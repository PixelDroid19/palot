/**
 * SSE event coalescing keys for the connection-manager batcher.
 * Extracted for unit testing without Jotai or network I/O.
 */

/** Minimal event shape accepted from the SSE dispatcher. */
export interface SseEventLike {
	type: string
	properties?: unknown
}

/**
 * Returns a stable key for events that should replace earlier duplicates in the same flush window.
 */
export function coalescingKey(event: SseEventLike): string | undefined {
	if (event.type === "message.part.updated") {
		const props = event.properties as { part: { messageID: string; id: string } }
		return `part:${props.part.messageID}:${props.part.id}`
	}
	if (event.type === "message.part.delta") {
		const props = event.properties as { messageID: string; partID: string }
		return `part:${props.messageID}:${props.partID}`
	}
	if (event.type === "session.status") {
		const props = event.properties as { sessionID: string }
		return `status:${props.sessionID}`
	}
	return undefined
}