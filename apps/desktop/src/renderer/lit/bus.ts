/**
 * Tiny typed pub/sub + helpers for DOM event bubbling.
 *
 * Migrated Lit surfaces use:
 * - local UI state on the component
 * - bubbled CustomEvents for parent shells
 * - this bus for cross-tree topics (locale, theme, session selection)
 *
 * No React / Jotai dependency.
 */

export type BusHandler<T = unknown> = (payload: T) => void

export class EventBus {
	private readonly handlers = new Map<string, Set<BusHandler>>()

	subscribe<T = unknown>(topic: string, handler: BusHandler<T>): () => void {
		let set = this.handlers.get(topic)
		if (!set) {
			set = new Set()
			this.handlers.set(topic, set)
		}
		set.add(handler as BusHandler)
		return () => {
			set?.delete(handler as BusHandler)
			if (set && set.size === 0) this.handlers.delete(topic)
		}
	}

	publish<T = unknown>(topic: string, payload: T): void {
		const set = this.handlers.get(topic)
		if (!set) return
		for (const handler of [...set]) {
			try {
				handler(payload)
			} catch (err) {
				console.error(`[gcode-bus] handler error on ${topic}`, err)
			}
		}
	}

	clear(): void {
		this.handlers.clear()
	}

	topicCount(topic: string): number {
		return this.handlers.get(topic)?.size ?? 0
	}
}

/** App-wide bus singleton for the Lit renderer. */
export const gcodeBus = new EventBus()

/** Well-known topics (string constants avoid typos). */
export const BusTopics = {
	localeChanged: "gcode:locale-changed",
	themeChanged: "gcode:theme-changed",
	sessionSelect: "gcode:session-select",
	sessionListChanged: "gcode:session-list-changed",
	chatSend: "gcode:chat-send",
	chatStream: "gcode:chat-stream",
	nav: "gcode:nav",
} as const

export type BusTopic = (typeof BusTopics)[keyof typeof BusTopics]

/**
 * Dispatch a bubbling composed CustomEvent from a node (shadow-piercing).
 * Parents listen with @event or addEventListener.
 */
export function emitBubbled<T>(
	host: EventTarget,
	type: string,
	detail: T,
	options?: { cancelable?: boolean },
): boolean {
	return host.dispatchEvent(
		new CustomEvent(type, {
			detail,
			bubbles: true,
			composed: true,
			cancelable: options?.cancelable ?? false,
		}),
	)
}
