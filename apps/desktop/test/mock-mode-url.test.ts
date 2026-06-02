import { describe, expect, test } from "bun:test"
import { isMockModeUrl, withMockParam } from "@desktop/shared"

describe("isMockModeUrl", () => {
	test("detects mock=1 in hash query", () => {
		expect(isMockModeUrl("http://localhost:1420/#/?mock=1")).toBe(true)
	})

	test("detects mock=1 on nested hash route", () => {
		expect(isMockModeUrl("http://localhost:1420/#/settings/general?mock=1")).toBe(true)
	})

	test("returns false without mock param", () => {
		expect(isMockModeUrl("http://localhost:1420/#/")).toBe(false)
	})
})

describe("withMockParam", () => {
	test("appends mock=1", () => {
		expect(withMockParam("/settings/general")).toBe("/settings/general?mock=1")
	})

	test("merges with existing query", () => {
		expect(withMockParam("/foo?bar=1")).toBe("/foo?bar=1&mock=1")
	})
})