/**
 * Typed EventBus for Palot.
 *
 * Framework-neutral (plain TS). Providers (adapters, harness) publish facts here.
 * Core reducers, view models, automations, Lit/React hosts, IPC, and tests subscribe.
 *
 * Supports:
 * - channel-scoped pub/sub using CHANNELS constants (see channels.ts for full list:
 *   app.lifecycle, provider.connection, workspace.discovery, session.lifecycle,
 *   session.messages, session.permissions, session.questions, session.diff,
 *   automation.runs, settings.changed, ui.navigation)
 * - recording for replay tests (see replay.ts)
 * - batch publish for high-volume streams (messages/parts)
 * - coalescing for deltas (prevents excessive updates during streaming text/tool)
 *
 * All 11 recommended channels from roadmap/core-agent-platform.md are supported.
 * publish on any Channel; subscribers on specific get targeted delivery.
 *
 * Batching: publishBatch delivers in order synchronously; coalescer runs for
 * SESSION_MESSAGES before handlers. Use setCoalescer for custom (default is
 * coalesceMessageDeltas).
 *
 * Never holds UI state, provider SDKs, DOM, or Electron. Pure and serializable.
 *
 * @example
 * const bus = new InMemoryEventBus()
 * bus.setCoalescer(coalesceMessageDeltas)
 * const unsub = bus.subscribe(CHANNELS.SESSION_MESSAGES, (env) => { ... })
 * bus.publish(CHANNELS.SESSION_LIFECYCLE, { type: "session.created", ... })
 * unsub()
 */

import type { Channel } from "./channels"
import { CHANNELS } from "./channels"
import type { EventEnvelope, MessagePartDeltaEvent, PalotEvent } from "./event-types"

export type EventHandler<T extends PalotEvent = PalotEvent> = (
	envelope: EventEnvelope<T>,
) => void | Promise<void>

export interface EventBus {
	/** Publish a single fact on a channel. Notifies subscribers immediately. */
	publish<T extends PalotEvent>(channel: Channel, event: T): void

	/**
	 * Publish multiple events (useful for message streams).
	 * Delivers in order; future impls may coalesce within batch.
	 */
	publishBatch<T extends PalotEvent>(channel: Channel, events: T[]): void

	/**
	 * Subscribe to a channel. Handler receives typed envelope.
	 * Returns unsubscribe function. Safe to call multiple times.
	 */
	subscribe<T extends PalotEvent>(channel: Channel, handler: EventHandler<T>): () => void

	/**
	 * Enable/disable recording of all published envelopes (for tests + replay).
	 * When enabled, appends to internal buffer. Stop does not clear.
	 */
	record(enabled: boolean): void

	/** Snapshot of recorded envelopes (cloned). */
	getRecorded(): EventEnvelope[]

	/** Clear the recording buffer. */
	clearRecorded(): void

	/**
	 * Optional: set a coalescer for deltas on high-volume channels.
	 * When set, publish on SESSION_MESSAGES will run coalescer before dispatch.
	 * Default: no-op (identity).
	 */
	setCoalescer(coalescer: (events: PalotEvent[]) => PalotEvent[]): void
}

export class InMemoryEventBus implements EventBus {
	private listeners = new Map<Channel, Set<EventHandler>>()
	private recorded: EventEnvelope[] = []
	private isRecording = false
	private coalescer: (events: PalotEvent[]) => PalotEvent[] = (e) => e

	publish<T extends PalotEvent>(channel: Channel, event: T): void {
		this.publishBatch(channel, [event])
	}

	publishBatch<T extends PalotEvent>(channel: Channel, events: T[]): void {
		if (events.length === 0) return

		let toDeliver: PalotEvent[] = events
		// Only coalesce on the messages channel by default (high volume parts)
		if (channel === CHANNELS.SESSION_MESSAGES) {
			toDeliver = this.coalescer(events as PalotEvent[])
		}

		const handlers = this.listeners.get(channel)
		for (const evt of toDeliver) {
			const envelope: EventEnvelope = { channel, event: evt }
			if (handlers) {
				for (const handler of handlers) {
					try {
						void handler(envelope)
					} catch (err) {
						// Platform logger would go here; keep deterministic in core
						// eslint-disable-next-line no-console
						console.error(`[events] handler error on ${channel}`, err)
					}
				}
			}
			if (this.isRecording) {
				this.recorded.push({ ...envelope })
			}
		}
	}

	subscribe<T extends PalotEvent>(channel: Channel, handler: EventHandler<T>): () => void {
		if (!this.listeners.has(channel)) {
			this.listeners.set(channel, new Set())
		}
		const set = this.listeners.get(channel)!
		set.add(handler as EventHandler)
		return () => {
			set.delete(handler as EventHandler)
			if (set.size === 0) this.listeners.delete(channel)
		}
	}

	record(enabled: boolean): void {
		this.isRecording = enabled
	}

	getRecorded(): EventEnvelope[] {
		return [...this.recorded]
	}

	clearRecorded(): void {
		this.recorded = []
	}

	setCoalescer(coalescer: (events: PalotEvent[]) => PalotEvent[]): void {
		this.coalescer = coalescer
	}
}

/**
 * Default coalescer for message.part.delta events.
 * Consecutive deltas for same (session, message, part, field) are merged into
 * the last delta with concatenated content. Other events pass through.
 * This reduces re-render pressure for streaming text/tool output.
 *
 * Only applied automatically by InMemoryEventBus for CHANNELS.SESSION_MESSAGES
 * channel (high-volume). Adapters or bus users can supply custom via setCoalescer.
 *
 * @example
 * bus.setCoalescer(coalesceMessageDeltas)
 * // or custom: bus.setCoalescer((evs) => evs.filter(e => e.type !== "foo"))
 */
export function coalesceMessageDeltas(events: PalotEvent[]): PalotEvent[] {
	const result: PalotEvent[] = []
	// key -> last delta index in result
	const pendingDeltaIdx = new Map<string, number>()

	for (const evt of events) {
		if (evt.type !== "message.part.delta") {
			result.push(evt)
			continue
		}
		const d = evt as MessagePartDeltaEvent
		const key = `${d.sessionId}:${d.messageId}:${d.partId}:${d.field}`
		const prevIdx = pendingDeltaIdx.get(key)
		if (
			prevIdx !== undefined &&
			prevIdx === result.length - 1 &&
			result[prevIdx].type === "message.part.delta"
		) {
			const prev = result[prevIdx] as MessagePartDeltaEvent
			// merge delta (only truly consecutive)
			result[prevIdx] = {
				...prev,
				delta: prev.delta + d.delta,
				at: d.at, // advance timestamp to latest
			} as PalotEvent
		} else {
			result.push(evt)
			pendingDeltaIdx.set(key, result.length - 1)
		}
	}
	return result
}

// Singleton default for convenience during early bootstrap (can be replaced by DI later).
// In production wiring, a single bus instance is shared across adapter + core + shell.
export const eventBus: EventBus = new InMemoryEventBus()
eventBus.setCoalescer(coalesceMessageDeltas)

// ============================================================
// CommandBus (simple, for roadmap completeness)
// Separate from EventBus: UI/automations dispatch intentions; adapters listen
// and turn into provider calls; outcomes return as events on the eventBus.
// Commands use PalotCommand from core but bus here is generic for portability.
// ============================================================

export type CommandHandler<C = unknown> = (command: C) => void | Promise<void>

/**
 * Typed command bus contract.
 * Dispatch user/system intentions (e.g. session.prompt, permission.respond).
 * Subscribers (provider adapters, harness) receive and execute.
 * Supports recording for tests / deterministic replay of command sequences.
 * Framework neutral, no side effects in the bus itself.
 */
export interface CommandBus<C = unknown> {
	/** Dispatch a command. Notifies all current subscribers immediately (sync). */
	dispatch(command: C): void

	/**
	 * Subscribe to all commands on this bus.
	 * Returns unsubscribe fn. Multiple subscribers allowed (e.g. log + adapter).
	 */
	subscribe(handler: CommandHandler<C>): () => void

	/** Enable/disable recording of dispatched commands (for harness/tests). */
	record(enabled: boolean): void

	/** Snapshot of recorded commands (cloned shallow). */
	getRecorded(): C[]

	/** Clear recorded commands buffer. */
	clearRecorded(): void
}

/**
 * In-memory impl of CommandBus. Use for app, tests, harness.
 *
 * @example
 * const cmdBus: CommandBus<PalotCommand> = new InMemoryCommandBus()
 * cmdBus.record(true)
 * cmdBus.subscribe((cmd) => adapter.dispatch(cmd))
 * cmdBus.dispatch({ type: "session.prompt", sessionId: "s1", parts: [...] })
 */
export class InMemoryCommandBus<C = unknown> implements CommandBus<C> {
	private listeners = new Set<CommandHandler<C>>()
	private recorded: C[] = []
	private isRecording = false

	dispatch(command: C): void {
		for (const handler of this.listeners) {
			try {
				void handler(command)
			} catch (err) {
				// eslint-disable-next-line no-console
				console.error("[events] command handler error", err)
			}
		}
		if (this.isRecording) {
			this.recorded.push(command)
		}
	}

	subscribe(handler: CommandHandler<C>): () => void {
		this.listeners.add(handler)
		return () => {
			this.listeners.delete(handler)
		}
	}

	record(enabled: boolean): void {
		this.isRecording = enabled
	}

	getRecorded(): C[] {
		return [...this.recorded]
	}

	clearRecorded(): void {
		this.recorded = []
	}
}

// Default command bus singleton (replaceable in wiring like eventBus).
export const commandBus: CommandBus = new InMemoryCommandBus()
