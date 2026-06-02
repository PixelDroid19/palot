import { describe, expect, test } from "bun:test"
import {
	AUTOMATION_CONCURRENCY_LIMIT,
	MAX_MESSAGES_PER_SESSION,
	SESSIONS_PAGE_SIZE,
} from "@desktop/shared"

describe("scale-limits", () => {
	test("exports expected defaults", () => {
		expect(MAX_MESSAGES_PER_SESSION).toBe(200)
		expect(SESSIONS_PAGE_SIZE).toBe(5)
		expect(AUTOMATION_CONCURRENCY_LIMIT).toBe(5)
	})
})