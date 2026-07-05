import { describe, expect, test } from "bun:test"
import { buildPayload, type WebhookEvent } from "../src/main/webhook-payloads"

const EVENT: WebhookEvent = {
	type: "completed",
	title: "Task done",
	body: "The agent finished.",
	sessionId: "ses_123",
}

describe("buildPayload", () => {
	test("Feishu uses msg_type/content.text with a [Palot] prefix", () => {
		expect(buildPayload("feishu", EVENT)).toEqual({
			msg_type: "text",
			content: { text: "[Palot] Task done\nThe agent finished." },
		})
	})

	test("WeChat Work uses msgtype/text.content", () => {
		expect(buildPayload("wechat", EVENT)).toEqual({
			msgtype: "text",
			text: { content: "[Palot] Task done\nThe agent finished." },
		})
	})

	test("generic emits a flat JSON body with source and raw fields", () => {
		expect(buildPayload("generic", EVENT)).toEqual({
			title: "Task done",
			body: "The agent finished.",
			type: "completed",
			sessionId: "ses_123",
			source: "palot",
		})
	})

	test("generic tolerates a missing sessionId", () => {
		const payload = buildPayload("generic", { ...EVENT, sessionId: undefined }) as {
			sessionId?: string
		}
		expect(payload.sessionId).toBeUndefined()
	})
})
