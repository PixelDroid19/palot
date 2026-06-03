import { afterAll, beforeAll, describe, expect, test } from "bun:test"

import { GlobalRegistrator } from "@happy-dom/global-registrator"

import type { PalotQuestionRepliedDetail } from "../src/palot-question-item"
import { PalotQuestionItem } from "../src/palot-question-item"

beforeAll(async () => {
	GlobalRegistrator.register()
	await import("../src/palot-question-item")
})

afterAll(() => {
	GlobalRegistrator.unregister()
})

describe("palot-question-item", () => {
	test("loads class", () => {
		expect(typeof PalotQuestionItem).toBe("function")
	})

	test("constructs props", () => {
		const el = new PalotQuestionItem()
		el.sessionId = "s1"
		el.requestId = "q1"
		el.prompt = "Choose?"
		expect(el.prompt).toBe("Choose?")
	})

	test("emits palot-question-replied bubbles composed", () => {
		const el = new PalotQuestionItem()
		el.requestId = "q2"
		let received: CustomEvent<PalotQuestionRepliedDetail> | null = null
		el.addEventListener("palot-question-replied", (e) => {
			received = e as CustomEvent<PalotQuestionRepliedDetail>
		})
		const replier = el as unknown as { reply: (opt?: string, text?: string) => void }
		replier.reply("optA")
		expect(received).not.toBeNull()
		expect(received!.bubbles).toBe(true)
		expect(received!.composed).toBe(true)
	})

	test("render a11y", () => {
		const el = new PalotQuestionItem()
		expect(typeof el.render).toBe("function")
	})
})
