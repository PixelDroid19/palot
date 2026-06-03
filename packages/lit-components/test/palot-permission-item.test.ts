import { afterAll, beforeAll, describe, expect, test } from "bun:test"

import { GlobalRegistrator } from "@happy-dom/global-registrator"

import type { PalotPermissionRespondedDetail } from "../src/palot-permission-item"
import { PalotPermissionItem } from "../src/palot-permission-item"

beforeAll(async () => {
	GlobalRegistrator.register()
	await import("../src/palot-permission-item")
})

afterAll(() => {
	GlobalRegistrator.unregister()
})

describe("palot-permission-item", () => {
	test("loads class", () => {
		expect(typeof PalotPermissionItem).toBe("function")
	})

	test("constructs and accepts props", () => {
		const el = new PalotPermissionItem()
		el.requestId = "req-1"
		el.tool = "fs.read"
		el.args = { path: "/tmp" }
		expect(el.requestId).toBe("req-1")
		expect(el.tool).toBe("fs.read")
	})

	test("emits palot-permission-responded with bubbles composed", () => {
		const el = new PalotPermissionItem()
		el.requestId = "req-2"
		let received: CustomEvent<PalotPermissionRespondedDetail> | null = null
		el.addEventListener("palot-permission-responded", (e: Event) => {
			received = e as CustomEvent<PalotPermissionRespondedDetail>
		})
		// access private via shape for test (no loose any)
		const responder = el as unknown as { respond: (r: "allow" | "deny") => void }
		responder.respond("allow")
		expect(received).not.toBeNull()
		expect(received!.detail.response).toBe("allow")
		expect(received!.bubbles).toBe(true)
		expect(received!.composed).toBe(true)
	})

	test("render + a11y basics", () => {
		const el = new PalotPermissionItem()
		expect(typeof el.render).toBe("function")
	})
})
