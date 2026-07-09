/**
 * Event bus + bubbling helpers used by Lit components.
 */
import { describe, expect, test } from "bun:test"
import { BusTopics, EventBus, emitBubbled, gcodeBus } from "../src/renderer/lit/bus"

describe("gcode EventBus (shipped)", () => {
	test("publish delivers payload to subscribers", () => {
		const bus = new EventBus()
		const seen: unknown[] = []
		const unsub = bus.subscribe("t", (p) => seen.push(p))
		bus.publish("t", { a: 1 })
		bus.publish("t", { a: 2 })
		unsub()
		bus.publish("t", { a: 3 })
		expect(seen).toEqual([{ a: 1 }, { a: 2 }])
		expect(bus.topicCount("t")).toBe(0)
	})

	test("singleton gcodeBus locale topic works", () => {
		const seen: string[] = []
		const unsub = gcodeBus.subscribe<string>(BusTopics.localeChanged, (l) => seen.push(l))
		gcodeBus.publish(BusTopics.localeChanged, "es")
		gcodeBus.publish(BusTopics.localeChanged, "en")
		unsub()
		expect(seen).toEqual(["es", "en"])
	})

	test("emitBubbled creates composed CustomEvent", () => {
		const host = new EventTarget()
		let detail: unknown = null
		host.addEventListener("gcode-send", ((e: Event) => {
			detail = (e as CustomEvent).detail
		}) as EventListener)
		const ok = emitBubbled(host, "gcode-send", { text: "hi" })
		expect(ok).toBe(true)
		expect(detail).toEqual({ text: "hi" })
	})
})
