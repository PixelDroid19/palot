import { afterAll, beforeAll, describe, expect, test } from "bun:test"

import { GlobalRegistrator } from "@happy-dom/global-registrator"

import type { PalotAutomationActionDetail } from "../src/palot-automation-row"
import { PalotAutomationRow } from "../src/palot-automation-row"

beforeAll(async () => {
	GlobalRegistrator.register()
	await import("../src/palot-automation-row")
})

afterAll(() => {
	GlobalRegistrator.unregister()
})

describe("palot-automation-row", () => {
	test("loads class", () => {
		expect(typeof PalotAutomationRow).toBe("function")
	})

	test("constructs and props", () => {
		const el = new PalotAutomationRow()
		el.automationId = "a1"
		el.title = "Nightly"
		el.status = "running"
		expect(el.title).toBe("Nightly")
	})

	test("emits palot-automation-action bubbles composed", () => {
		const el = new PalotAutomationRow()
		el.automationId = "a2"
		let received: CustomEvent<PalotAutomationActionDetail> | null = null
		el.addEventListener("palot-automation-action", (e) => {
			received = e as CustomEvent<PalotAutomationActionDetail>
		})
		const emitter = el as unknown as { emit: (a: PalotAutomationActionDetail["action"]) => void }
		emitter.emit("run-now")
		expect(received).not.toBeNull()
		expect(received!.detail.action).toBe("run-now")
		expect(received!.bubbles).toBe(true)
		expect(received!.composed).toBe(true)
	})

	test("render + a11y", () => {
		const el = new PalotAutomationRow()
		expect(typeof el.render).toBe("function")
	})
})
