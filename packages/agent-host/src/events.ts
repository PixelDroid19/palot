/**
 * Minimal typed event bus. The host and context store publish through this so
 * consumers (IPC layers, plugins, logs) subscribe without coupling to
 * internals. Listeners must never throw; failures are isolated per listener.
 */

export type Listener<T> = (payload: T) => void

export class EventBus<Events extends Record<string, unknown>> {
	private listeners = new Map<keyof Events, Set<Listener<never>>>()

	on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
		let set = this.listeners.get(event)
		if (!set) {
			set = new Set()
			this.listeners.set(event, set)
		}
		set.add(listener as Listener<never>)
		return () => set?.delete(listener as Listener<never>)
	}

	emit<K extends keyof Events>(event: K, payload: Events[K]): void {
		const set = this.listeners.get(event)
		if (!set) return
		for (const listener of set) {
			try {
				;(listener as Listener<Events[K]>)(payload)
			} catch {
				// One bad subscriber must not break the others.
			}
		}
	}
}
