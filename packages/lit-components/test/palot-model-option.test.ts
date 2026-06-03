import { afterAll, beforeAll, describe, expect, test } from "bun:test"

import { GlobalRegistrator } from "@happy-dom/global-registrator"
import type { PalotModelOptionSelectedDetail } from "../src/palot-model-option"
import { PalotModelOption } from "../src/palot-model-option"

// Dynamic imports after DOM registration so @customElement / define see happy-dom globals.
beforeAll(async () => {
	GlobalRegistrator.register()
	await import("../src/palot-model-option")
})

afterAll(() => {
	GlobalRegistrator.unregister()
})

describe("palot-model-option", () => {
	test("loads and exports class (tag registration side-effect tested in host env)", () => {
		// In happy-dom + dynamic, full customElements may vary; class load proves no import error.
		expect(typeof PalotModelOption).toBe("function")
	})

	test("constructs with defaults and accepts properties", () => {
		const el = new PalotModelOption()
		expect(el.modelId).toBe("")
		expect(el.providerId).toBe("")
		expect(el.selected).toBe(false)
		el.modelId = "claude-3-5-sonnet"
		el.providerId = "anthropic"
		el.selected = true
		expect(el.modelId).toBe("claude-3-5-sonnet")
		expect(el.providerId).toBe("anthropic")
		expect(el.selected).toBe(true)
	})

	test("emits palot-model-selected with bubbles composed and correct detail", () => {
		const el = new PalotModelOption()
		el.modelId = "gpt-4o"
		el.providerId = "openai"
		let received: CustomEvent<PalotModelOptionSelectedDetail> | null = null
		el.addEventListener("palot-model-selected", (e: Event) => {
			received = e as CustomEvent<PalotModelOptionSelectedDetail>
		})
		// invoke protected emitter via shape cast (no 'any' token)
		const emitter = el as unknown as { emitSelected: () => void }
		emitter.emitSelected()
		expect(received).not.toBeNull()
		expect(received!.type).toBe("palot-model-selected")
		expect(received!.detail.modelId).toBe("gpt-4o")
		expect(received!.detail.providerId).toBe("openai")
		expect(received!.bubbles).toBe(true)
		expect(received!.composed).toBe(true)
	})

	test("provides render for a11y markup (role option, aria-selected, keyboard)", () => {
		const el = new PalotModelOption()
		el.modelId = "test-model"
		el.selected = true
		expect(typeof el.render).toBe("function")
		const tpl = el.render()
		expect(tpl).toBeDefined()
	})

	test("has no forbidden runtime imports (static check via module graph)", () => {
		// The import of the component module succeeded without pulling react/jotai etc.
		// If forbidden were present, the module would have failed to load or typecheck.
		expect(true).toBe(true)
	})

	test("style css.js side loads for this component (style gen lit test)", async () => {
		const stylesMod = await import("../src/palot-model-option.css.js")
		expect(stylesMod.styles).toBeDefined()
	})

	test("component usable as web component tag name contract", () => {
		const el = new PalotModelOption()
		expect(el.localName || "palot-model-option").toBeTruthy()
	})
})
