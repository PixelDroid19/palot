/**
 * Mutable adapter registry — the plugin point for new agent runtimes. The
 * built-in adapters register themselves at host construction; embedders (or
 * future plugin loaders) call `register` to add CLIs without touching core.
 */
import type { AgentAdapter, AgentRuntimeId } from "./types"

export class AdapterRegistry {
	private adapters = new Map<AgentRuntimeId, AgentAdapter>()

	register(adapter: AgentAdapter): void {
		if (this.adapters.has(adapter.id)) {
			throw new Error(`Agent adapter already registered: ${adapter.id}`)
		}
		this.adapters.set(adapter.id, adapter)
	}

	get(id: AgentRuntimeId): AgentAdapter | undefined {
		return this.adapters.get(id)
	}

	list(): AgentAdapter[] {
		return [...this.adapters.values()]
	}
}
