/**
 * Public status-dot helpers + React string-wire path that ships in production.
 */
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"
import { Window } from "happy-dom"
import {
	coerceHealthState,
	healthToStatusDotKind,
	statusDotKindLabel,
} from "../src/renderer/lit/status-dot"

const globalsBackup: Record<string, unknown> = {}

describe("status-dot public helpers", () => {
	test("maps boolean|null health to stable kinds", () => {
		expect(healthToStatusDotKind(null)).toBe("checking")
		expect(healthToStatusDotKind(true)).toBe("ok")
		expect(healthToStatusDotKind(false)).toBe("bad")
	})

	test("coerceHealthState + healthToStatusDotKind treat React string props correctly", () => {
		// React createElement can set these as string properties on custom elements
		expect(coerceHealthState("true")).toBe(true)
		expect(coerceHealthState("false")).toBe(false)
		expect(coerceHealthState("null")).toBe(null)
		expect(healthToStatusDotKind("true")).toBe("ok")
		expect(healthToStatusDotKind("false")).toBe("bad")
		expect(healthToStatusDotKind("null")).toBe("checking")
		// Must NOT treat non-empty "false" as truthy
		expect(healthToStatusDotKind("false")).not.toBe("ok")
		expect(healthToStatusDotKind("null")).not.toBe("ok")
	})

	test("labels are human-readable", () => {
		expect(statusDotKindLabel("checking")).toMatch(/check/i)
		expect(statusDotKindLabel("ok")).toMatch(/online/i)
		expect(statusDotKindLabel("bad")).toMatch(/offline/i)
	})

})

describe("gcode-status-dot shipped element (React string property path)", () => {
	let window: Window
	const nodes: Element[] = []

	beforeAll(async () => {
		window = new Window({ url: "https://localhost/" })
		for (const key of ["window", "document", "HTMLElement", "customElements", "CustomEvent"] as const) {
			globalsBackup[key] = (globalThis as Record<string, unknown>)[key]
		}
		// Lit custom elements need global document/customElements/HTMLElement
		// @ts-expect-error test DOM globals
		globalThis.window = window
		// @ts-expect-error test DOM globals
		globalThis.document = window.document
		// @ts-expect-error test DOM globals
		globalThis.HTMLElement = window.HTMLElement
		// @ts-expect-error test DOM globals
		globalThis.customElements = window.customElements
		// @ts-expect-error test DOM globals
		globalThis.CustomEvent = window.CustomEvent
		// Register after DOM globals exist
		await import("../src/renderer/lit/components/gcode-status-dot")
	})

	afterAll(() => {
		for (const key of Object.keys(globalsBackup)) {
			const v = globalsBackup[key]
			if (v === undefined) {
				// @ts-expect-error cleanup
				delete (globalThis as Record<string, unknown>)[key]
			} else {
				;(globalThis as Record<string, unknown>)[key] = v
			}
		}
		window?.close()
	})

	afterEach(() => {
		for (const n of nodes) n.remove()
		nodes.length = 0
	})

	function mount(): HTMLElement & {
		health: unknown
		resolvedKind: () => string
		updateComplete: Promise<boolean>
	} {
		const el = document.createElement("gcode-status-dot") as HTMLElement & {
			health: unknown
			resolvedKind: () => string
			updateComplete: Promise<boolean>
		}
		document.body.appendChild(el)
		nodes.push(el)
		return el
	}

	test("property health=\"false\" (React wire) → data-kind=bad", async () => {
		const el = mount()
		// Simulate React 19 assigning a string property, bypassing fromAttribute
		el.health = "false"
		await el.updateComplete
		expect(el.resolvedKind()).toBe("bad")
		expect(el.getAttribute("data-kind")).toBe("bad")
	})

	test("property health=\"null\" (React wire) → data-kind=checking", async () => {
		const el = mount()
		el.health = "null"
		await el.updateComplete
		expect(el.resolvedKind()).toBe("checking")
		expect(el.getAttribute("data-kind")).toBe("checking")
	})

	test("property health=\"true\" → data-kind=ok", async () => {
		const el = mount()
		el.health = "true"
		await el.updateComplete
		expect(el.resolvedKind()).toBe("ok")
		expect(el.getAttribute("data-kind")).toBe("ok")
	})

	test("boolean false property → data-kind=bad", async () => {
		const el = mount()
		el.health = false
		await el.updateComplete
		expect(el.resolvedKind()).toBe("bad")
		expect(el.getAttribute("data-kind")).toBe("bad")
	})
})
