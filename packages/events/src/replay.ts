import type { EventBus } from "./event-bus"
import type { EventEnvelope, PalotEvent } from "./event-types"

/**
 * Event replay utilities for deterministic testing and debugging.
 *
 * Load JSONL fixtures of EventEnvelope[] (produced by record + serialize).
 * Replay into a live bus (for integration) or directly into pure reducers
 * (preferred for core tests -- no side effects).
 *
 * Replay is async to allow microtask yields for any async handlers.
 * Reducer replay is sync and pure.
 *
 * Fixtures live in packages/events/fixtures/ and are committed.
 * See functional-testing.md , core-agent-platform.md , and roadmap/agent.md .
 *
 * Supports using existing fixtures for new tests without creating files.
 */

/**
 * Replay a list of envelopes onto an EventBus.
 * Publishes in order with a yield between each to let async subscribers run.
 *
 * @param bus - target EventBus (e.g. new InMemoryEventBus() or the singleton)
 * @param events - list of envelopes (channel + event)
 * @returns Promise that resolves after all publishes + yields
 *
 * @example
 * await replayEvents(bus, loadEventFixture(jsonl))
 */
export async function replayEvents(bus: EventBus, events: EventEnvelope[]): Promise<void> {
	for (const env of events) {
		bus.publish(env.channel, env.event)
		// Yield to allow async handlers / microtasks if needed in tests
		await Promise.resolve()
	}
}

/**
 * Load a JSONL string (one EventEnvelope per line) into typed array.
 * Throws on malformed JSON (test fixtures must be valid).
 *
 * @example
 * const events = loadEventFixture( fs.readFileSync("fixture.jsonl", "utf8") )
 */
export function loadEventFixture(jsonl: string): EventEnvelope[] {
	const lines = jsonl.trim().split("\n").filter(Boolean)
	return lines.map((line) => JSON.parse(line) as EventEnvelope)
}

/**
 * Serialize envelopes to JSONL (newline terminated).
 * Useful to create new fixtures from recorded bus.getRecorded() in tests.
 */
export function serializeEvents(events: EventEnvelope[]): string {
	return `${events.map((e) => JSON.stringify(e)).join("\n")}\n`
}

/**
 * Pure reducer replay helper for core tests.
 * Applies only events matching the optional filterFn (e.g. session.* only).
 * Returns the final state after sequential reduce.
 *
 * Accepts EventEnvelope[] (preferred, from fixtures/bus record) or bare PalotEvent[]
 * (convenience for some adapter/harness/demo tests that build event lists directly).
 * No `any` used internally.
 *
 * @example
 * const final = replayEventsIntoReducer(fixtureEvents, initial, rootReducer)
 */
export function replayEventsIntoReducer<S>(
	events: Array<EventEnvelope | PalotEvent>,
	initialState: S,
	reducer: (state: S, event: PalotEvent) => S,
	filterFn?: (env: EventEnvelope) => boolean,
): S {
	let state = initialState
	for (const item of events) {
		const isEnv =
			item != null &&
			typeof item === "object" &&
			"event" in item &&
			(item as { event?: unknown }).event != null
		const ev = isEnv ? (item as EventEnvelope).event : (item as PalotEvent)
		const shouldApply = !filterFn || (isEnv ? filterFn(item as EventEnvelope) : true)
		if (shouldApply) {
			state = reducer(state, ev)
		}
	}
	return state
}
