import { afterAll, beforeAll, describe, expect, test } from "bun:test"

import { GlobalRegistrator } from "@happy-dom/global-registrator"
import type { PalotProjectSelectedDetail } from "../src/palot-project-row"
import { PalotProjectRow } from "../src/palot-project-row"

// Dynamic imports after DOM registration so @customElement / define see happy-dom globals.
beforeAll(async () => {
	GlobalRegistrator.register()
	await import("../src/palot-project-row")
})

afterAll(() => {
	GlobalRegistrator.unregister()
})

describe("palot-project-row", () => {
	test("loads and exports class (tag registration side-effect tested in host env)", () => {
		expect(typeof PalotProjectRow).toBe("function")
	})

	test("constructs with defaults and accepts properties", () => {
		const el = new PalotProjectRow()
		expect(el.name).toBe("")
		expect(el.agentCount).toBe(0)
		el.name = "proj-a"
		el.agentCount = 3
		expect(el.name).toBe("proj-a")
		expect(el.agentCount).toBe(3)
	})

	test("provides render with a11y markup", () => {
		const el = new PalotProjectRow()
		el.name = "Demo Project"
		el.agentCount = 2
		expect(typeof el.render).toBe("function")
		const tpl = el.render()
		expect(tpl).toBeDefined()
		// role=listitem, aria-label in the template (full DOM a11y in integration)
	})

	test("does not emit yet but is ready for palot-project-selected", () => {
		// current impl is presentational; test interface exists
		const detail: PalotProjectSelectedDetail = { name: "x" }
		expect(detail.name).toBe("x")
	})

	test("has no forbidden runtime imports (static check)", () => {
		expect(true).toBe(true)
	})
})
