import { describe, expect, test } from "bun:test"

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { ALL_CHANNELS, CHANNELS } from "../src/channels"
import { coalesceMessageDeltas, InMemoryCommandBus, InMemoryEventBus } from "../src/event-bus"
import type { EventEnvelope, PalotEvent } from "../src/event-types"
import { loadEventFixture, replayEvents, serializeEvents } from "../src/replay"

describe("InMemoryEventBus", () => {
	test("subscribe/publish roundtrip with typed channel", () => {
		const bus = new InMemoryEventBus()
		const received: EventEnvelope[] = []
		const unsub = bus.subscribe(CHANNELS.SESSION_LIFECYCLE, (e) => received.push(e))

		const evt: PalotEvent = {
			type: "session.created",
			at: 123,
			session: { id: "s1", workspaceId: "w", status: "idle" },
		}
		bus.publish(CHANNELS.SESSION_LIFECYCLE, evt)

		expect(received.length).toBe(1)
		expect(received[0].event.at).toBe(123)
		expect(received[0].channel).toBe(CHANNELS.SESSION_LIFECYCLE)
		unsub()
	})

	test("publishBatch and recording", () => {
		const bus = new InMemoryEventBus()
		bus.record(true)
		const evts: PalotEvent[] = [
			{ type: "session.created", at: 1, session: { id: "s1", workspaceId: "w", status: "idle" } },
			{ type: "session.status.changed", at: 2, sessionId: "s1", status: "busy" },
		]
		bus.publishBatch(CHANNELS.SESSION_LIFECYCLE, evts)
		const rec = bus.getRecorded()
		expect(rec.length).toBe(2)
		bus.clearRecorded()
		expect(bus.getRecorded().length).toBe(0)
	})

	test("coalesceMessageDeltas merges consecutive same-part deltas", () => {
		const deltas: PalotEvent[] = [
			{
				type: "message.part.delta",
				at: 10,
				sessionId: "s",
				messageId: "m",
				partId: "p",
				field: "content",
				delta: "hel",
			},
			{
				type: "message.part.delta",
				at: 11,
				sessionId: "s",
				messageId: "m",
				partId: "p",
				field: "content",
				delta: "lo ",
			},
			{ type: "session.status.changed", at: 12, sessionId: "s", status: "busy" },
			{
				type: "message.part.delta",
				at: 13,
				sessionId: "s",
				messageId: "m",
				partId: "p",
				field: "content",
				delta: "world",
			},
		]
		const out = coalesceMessageDeltas(deltas)
		expect(out.length).toBe(3)
		const merged = out[0] as Extract<PalotEvent, { type: "message.part.delta" }>
		expect(merged.delta).toBe("hello ")
		expect(out[2].type).toBe("message.part.delta")
	})
})

describe("replay utilities", () => {
	test("loadEventFixture + serialize roundtrips", () => {
		const jsonl = readFileSync(
			join(import.meta.dir, "../fixtures/opencode-session-basic.jsonl"),
			"utf8",
		)
		const events = loadEventFixture(jsonl)
		expect(events.length).toBeGreaterThan(0)
		const back = serializeEvents(events)
		expect(back.split("\n").filter(Boolean).length).toBe(events.length)
		const reloaded = loadEventFixture(back)
		expect(reloaded[0].event.type).toBe("session.created")
	})

	test("replayEvents delivers to subscribers", async () => {
		const jsonl = readFileSync(
			join(import.meta.dir, "../fixtures/opencode-session-basic.jsonl"),
			"utf8",
		)
		const events = loadEventFixture(jsonl)
		const bus = new InMemoryEventBus()
		const seen: EventEnvelope[] = []
		bus.subscribe(CHANNELS.SESSION_LIFECYCLE, (e) => seen.push(e))
		bus.subscribe(CHANNELS.SESSION_MESSAGES, (e) => seen.push(e))

		await replayEvents(bus, events)
		// fixture has 3 lifecycle + 3 message + (perm ignored by these subs) = 6 total to the two channel subs
		expect(seen.length).toBe(6)
		expect(seen.filter((e) => e.channel === CHANNELS.SESSION_LIFECYCLE).length).toBe(3)
	})
})

describe("CommandBus", () => {
	test("InMemoryCommandBus dispatch/subscribe/record", () => {
		const bus = new InMemoryCommandBus<Record<string, unknown>>()
		const received: Record<string, unknown>[] = []
		const unsub = bus.subscribe((c: Record<string, unknown>) => received.push(c))
		bus.record(true)
		bus.dispatch({ type: "session.prompt", sessionId: "s1" })
		bus.dispatch({ type: "permission.respond", requestId: "p1" })
		expect(received.length).toBe(2)
		const rec = bus.getRecorded()
		expect(rec.length).toBe(2)
		unsub()
		bus.clearRecorded()
		expect(bus.getRecorded().length).toBe(0)
	})
})

describe("channels and replay coverage", () => {
	test("ALL_CHANNELS includes all recommended", () => {
		expect(ALL_CHANNELS.length).toBeGreaterThanOrEqual(10)
		expect(ALL_CHANNELS).toContain(CHANNELS.SESSION_DIFF)
		expect(ALL_CHANNELS).toContain(CHANNELS.SETTINGS_CHANGED)
	})

	test("replay uses fixture with diff + messages coalescable", async () => {
		const jsonl = readFileSync(
			join(import.meta.dir, "../fixtures/opencode-streaming-tool-call.jsonl"),
			"utf8",
		)
		const events = loadEventFixture(jsonl)
		const bus = new InMemoryEventBus()
		const seen: EventEnvelope[] = []
		bus.subscribe(CHANNELS.SESSION_DIFF, (e) => seen.push(e))
		bus.subscribe(CHANNELS.SESSION_MESSAGES, (e) => seen.push(e))
		await replayEvents(bus, events)
		expect(seen.some((e) => e.event.type === "session.diff.updated")).toBe(true)
	})
})
