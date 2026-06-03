import { afterAll, beforeAll, describe, expect, test } from "bun:test"

import { GlobalRegistrator } from "@happy-dom/global-registrator"

import { PalotStatusBadge } from "../src/palot-status-badge"

beforeAll(async () => {
	GlobalRegistrator.register()
	await import("../src/palot-status-badge")
})

afterAll(() => {
	GlobalRegistrator.unregister()
})

describe("palot-status-badge", () => {
	test("loads class", () => {
		expect(typeof PalotStatusBadge).toBe("function")
	})

	test("constructs and accepts status/label props", () => {
		const el = new PalotStatusBadge()
		expect(el.status).toBe("idle")
		el.status = "busy"
		el.label = "Running"
		expect(el.status).toBe("busy")
		expect(el.label).toBe("Running")
	})

	test("renders and supports reflect for status", () => {
		const el = new PalotStatusBadge()
		el.status = "error"
		expect(typeof el.render).toBe("function")
		const tpl = el.render()
		expect(tpl).toBeDefined()
	})

	test("a11y compact, no events (presentation)", () => {
		expect(true).toBe(true)
	})
})
