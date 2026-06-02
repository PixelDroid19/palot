import { describe, expect, test } from "bun:test"
import {
	binarySearchById,
	capMessageList,
	mergeMessagesById,
} from "@desktop/shared"

describe("binarySearchById", () => {
	test("finds existing id", () => {
		const arr = [{ id: "a" }, { id: "c" }, { id: "e" }]
		const result = binarySearchById(arr, "c")
		expect(result.found).toBe(true)
		expect(result.index).toBe(1)
	})

	test("returns insert index for missing id", () => {
		const arr = [{ id: "a" }, { id: "c" }]
		const result = binarySearchById(arr, "b")
		expect(result.found).toBe(false)
		expect(result.index).toBe(1)
	})
})

describe("capMessageList", () => {
	test("returns unchanged when under cap", () => {
		const messages = [{ id: "1" }, { id: "2" }]
		const result = capMessageList(messages, 5)
		expect(result.messages).toEqual(messages)
		expect(result.removedIds).toEqual([])
	})

	test("drops oldest when over cap", () => {
		const messages = [{ id: "1" }, { id: "2" }, { id: "3" }]
		const result = capMessageList(messages, 2)
		expect(result.messages.map((m) => m.id)).toEqual(["2", "3"])
		expect(result.removedIds).toEqual(["1"])
	})
})

describe("mergeMessagesById", () => {
	test("merges new ids in sorted order", () => {
		const existing = [{ id: "a" }, { id: "c" }]
		const incoming = [{ id: "b" }, { id: "d" }]
		const merged = mergeMessagesById(existing, incoming)
		expect(merged.map((m) => m.id)).toEqual(["a", "b", "c", "d"])
	})

	test("skips duplicate ids from incoming", () => {
		const existing = [{ id: "a" }, { id: "b" }]
		const incoming = [{ id: "b" }, { id: "c" }]
		const merged = mergeMessagesById(existing, incoming)
		expect(merged.map((m) => m.id)).toEqual(["a", "b", "c"])
	})
})