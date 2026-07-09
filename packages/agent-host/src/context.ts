/**
 * Shared context store: a small namespaced KV that agents read/write through
 * the bridge (`gcode_context_get` / `gcode_context_set` MCP tools) and the app
 * can inspect. This is how two CLIs collaborate on one task without pasting
 * transcripts around — one writes findings, the other reads them.
 */
import { EventBus } from "./events"

export interface ContextEntry {
	key: string
	value: string
	/** Which agent/session wrote it (freeform attribution). */
	author: string
	updatedAt: number
}

export interface ContextEvents extends Record<string, unknown> {
	change: { entry: ContextEntry }
	delete: { key: string }
}

const MAX_ENTRIES = 500
const MAX_VALUE_LENGTH = 256 * 1024

export class SharedContextStore {
	readonly events = new EventBus<ContextEvents>()
	private entries = new Map<string, ContextEntry>()

	get(key: string): ContextEntry | undefined {
		return this.entries.get(key)
	}

	list(): ContextEntry[] {
		return [...this.entries.values()].sort((a, b) => b.updatedAt - a.updatedAt)
	}

	set(key: string, value: string, author: string): ContextEntry {
		if (!key.trim()) throw new Error("Context key is required")
		if (value.length > MAX_VALUE_LENGTH) {
			throw new Error(`Context value exceeds ${MAX_VALUE_LENGTH} bytes`)
		}
		if (!this.entries.has(key) && this.entries.size >= MAX_ENTRIES) {
			throw new Error(`Context store is full (${MAX_ENTRIES} keys)`)
		}
		const entry: ContextEntry = { key, value, author, updatedAt: Date.now() }
		this.entries.set(key, entry)
		this.events.emit("change", { entry })
		return entry
	}

	delete(key: string): boolean {
		const existed = this.entries.delete(key)
		if (existed) this.events.emit("delete", { key })
		return existed
	}
}
