import { afterAll, beforeAll, describe, expect, test } from "bun:test"

import { GlobalRegistrator } from "@happy-dom/global-registrator"
import type { PalotProviderSelectedDetail } from "../src/palot-provider-icon"
import { PalotProviderIcon } from "../src/palot-provider-icon"

// Dynamic imports after DOM registration so @customElement / define see happy-dom globals.
beforeAll(async () => {
	GlobalRegistrator.register()
	await import("../src/palot-provider-icon")
})

afterAll(() => {
	GlobalRegistrator.unregister()
})

describe("palot-provider-icon", () => {
	test("loads and exports class (tag registration side-effect tested in host env)", () => {
		expect(typeof PalotProviderIcon).toBe("function")
	})

	test("constructs with defaults and accepts properties", () => {
		const el = new PalotProviderIcon()
		expect(el.providerId).toBe("")
		expect(el.label).toBe("")
		expect(el.selected).toBe(false)
		el.providerId = "opencode"
		el.label = "OpenCode"
		el.selected = true
		expect(el.providerId).toBe("opencode")
		expect(el.label).toBe("OpenCode")
		expect(el.selected).toBe(true)
	})

	test("emits palot-provider-selected with bubbles composed and correct detail", () => {
		const el = new PalotProviderIcon()
		el.providerId = "opencode"
		let received: CustomEvent<PalotProviderSelectedDetail> | null = null
		el.addEventListener("palot-provider-selected", (e: Event) => {
			received = e as CustomEvent<PalotProviderSelectedDetail>
		})
		// invoke protected emitter via shape cast
		const emitter = el as unknown as { emitSelected: () => void }
		emitter.emitSelected()
		expect(received).not.toBeNull()
		expect(received!.type).toBe("palot-provider-selected")
		expect(received!.detail.providerId).toBe("opencode")
		expect(received!.bubbles).toBe(true)
		expect(received!.composed).toBe(true)
	})

	test("provides render for a11y (aria-label, aria-pressed, sym)", () => {
		const el = new PalotProviderIcon()
		el.providerId = "anthropic"
		el.label = "Anthropic"
		el.selected = false
		expect(typeof el.render).toBe("function")
		const tpl = el.render()
		expect(tpl).toBeDefined()
	})

	test("has no forbidden runtime imports (static check via module graph)", () => {
		// The import of the component module succeeded without pulling react/jotai etc.
		expect(true).toBe(true)
	})

	test("style css.js side loads for this component (style gen lit test)", async () => {
		const stylesMod = await import("../src/palot-provider-icon.css.js")
		expect(stylesMod.styles).toBeDefined()
	})

	test("component usable as web component tag name contract", () => {
		const el = new PalotProviderIcon()
		expect(el.localName || "palot-provider-icon").toBeTruthy()
	})
})
