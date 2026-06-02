import { describe, expect, test } from "bun:test"
import { coalescingKey } from "@desktop/shared"

describe("coalescingKey", () => {
	test("returns key for message.part.updated", () => {
		const key = coalescingKey({
			type: "message.part.updated",
			properties: { part: { messageID: "msg-1", id: "part-1" } },
		})
		expect(key).toBe("part:msg-1:part-1")
	})

	test("returns key for message.part.delta", () => {
		const key = coalescingKey({
			type: "message.part.delta",
			properties: { messageID: "msg-2", partID: "part-9" },
		})
		expect(key).toBe("part:msg-2:part-9")
	})

	test("returns key for session.status", () => {
		const key = coalescingKey({
			type: "session.status",
			properties: { sessionID: "ses-abc" },
		})
		expect(key).toBe("status:ses-abc")
	})

	test("returns undefined for unrelated events", () => {
		expect(coalescingKey({ type: "session.created", properties: {} })).toBeUndefined()
	})
})