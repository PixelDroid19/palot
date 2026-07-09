/**
 * Chat message ordering: chronological (time.created), not id string order.
 * Drives shipped compare/sort + groupIntoTurns on mixed id namespaces.
 */
import { describe, expect, test } from "bun:test"
import {
	compareMessagesChronological,
	sortMessagesChronological,
} from "../src/renderer/atoms/messages"
import {
	groupIntoTurns,
	type ChatMessageEntry,
} from "../src/renderer/atoms/derived/session-chat"
import type { Message } from "../src/renderer/lib/types"

function msg(args: {
	id: string
	role: "user" | "assistant"
	created: number
	sessionID?: string
	parentID?: string
}): Message {
	const base = {
		id: args.id,
		sessionID: args.sessionID ?? "s1",
		role: args.role,
		time: { created: args.created },
	}
	if (args.role === "user") {
		return {
			...base,
			role: "user",
			agent: "build",
			model: { providerID: "x", modelID: "y" },
		} as Message
	}
	return {
		...base,
		role: "assistant",
		parentID: args.parentID,
		modelID: "y",
		providerID: "x",
		mode: "build",
		path: { cwd: "/", root: "/" },
		cost: 0,
		tokens: {
			input: 0,
			output: 0,
			reasoning: 0,
			cache: { read: 0, write: 0 },
		},
	} as Message
}

function entry(message: Message): ChatMessageEntry {
	return { info: message, parts: [] }
}

describe("compareMessagesChronological / sortMessagesChronological", () => {
	test("orders by time.created ascending (oldest first)", () => {
		const a = msg({ id: "b", role: "user", created: 300 })
		const b = msg({ id: "a", role: "user", created: 100 })
		const c = msg({ id: "c", role: "user", created: 200 })
		const sorted = sortMessagesChronological([a, b, c])
		expect(sorted.map((m) => m.id)).toEqual(["a", "c", "b"])
		expect(sorted.map((m) => m.time.created)).toEqual([100, 200, 300])
	})

	test("pure CLI-style ids still follow time, not reverse string order", () => {
		// localeCompare of these ids is not the same as time order when mixed later
		const messages = [
			msg({ id: "cli-3000-0u", role: "user", created: 3000 }),
			msg({ id: "cli-1000-0u", role: "user", created: 1000 }),
			msg({ id: "cli-2000-0u", role: "user", created: 2000 }),
		]
		const sorted = sortMessagesChronological(messages)
		expect(sorted.map((m) => m.time.created)).toEqual([1000, 2000, 3000])
	})

	test("mixed OpenCode + cli + optimistic ids: time wins over localeCompare(id)", () => {
		// Deliberately craft ids where localeCompare is NOT chronological:
		// "zzz-old" > "aaa-new" as strings, but old time is smaller.
		const openCodeOld = msg({
			id: "01HZZZ_OPENCODE_OLD",
			role: "user",
			created: 1_000,
		})
		const openCodeAsst = msg({
			id: "01HZZZ_OPENCODE_ASST",
			role: "assistant",
			created: 1_100,
			parentID: openCodeOld.id,
		})
		const cliUser = msg({ id: "cli-5000-0u", role: "user", created: 5_000 })
		const cliAsst = msg({ id: "cli-5100-1a", role: "assistant", created: 5_100, parentID: cliUser.id })
		const optimistic = msg({ id: "optimistic-9999", role: "user", created: 9_000 })

		// Scramble input so only the shipped sort can produce correct order
		const scrambled = [optimistic, cliAsst, openCodeAsst, cliUser, openCodeOld]
		const sorted = sortMessagesChronological(scrambled)

		// Prove id string order would scramble relative to time for some pairs
		const idOrder = scrambled
			.slice()
			.sort((a, b) => a.id.localeCompare(b.id))
			.map((m) => m.id)
		const timeOrder = sorted.map((m) => m.id)
		expect(timeOrder).not.toEqual(idOrder)
		expect(sorted.map((m) => m.time.created)).toEqual([1_000, 1_100, 5_000, 5_100, 9_000])
		expect(timeOrder[0]).toBe(openCodeOld.id)
		expect(timeOrder.at(-1)).toBe(optimistic.id)
	})

	test("compare is antisymmetric for equal times (stable id tie-break)", () => {
		const a = msg({ id: "a", role: "user", created: 50 })
		const b = msg({ id: "b", role: "user", created: 50 })
		expect(compareMessagesChronological(a, b)).toBeLessThan(0)
		expect(compareMessagesChronological(b, a)).toBeGreaterThan(0)
		expect(compareMessagesChronological(a, a)).toBe(0)
	})
})

describe("groupIntoTurns walks chronological message list oldest→newest", () => {
	test("turn ids are oldest user message first after mixed-id sort", () => {
		const u1 = msg({ id: "cli-later-user", role: "user", created: 8000 })
		const a1 = msg({
			id: "cli-later-asst",
			role: "assistant",
			created: 8100,
			parentID: u1.id,
		})
		const u0 = msg({ id: "01_EARLY_USER", role: "user", created: 1000 })
		const a0 = msg({
			id: "01_EARLY_ASST",
			role: "assistant",
			created: 1100,
			parentID: u0.id,
		})

		// Id localeCompare would put "01_*" before "cli-*" correctly here, but
		// reverse the array so only time-sort restores conversation order.
		const sorted = sortMessagesChronological([u1, a1, u0, a0])
		const turns = groupIntoTurns(
			sorted.map(entry),
			[],
		)

		expect(turns.map((t) => t.id)).toEqual([u0.id, u1.id])
		expect(turns[0]!.assistantMessages.map((m) => m.info.id)).toEqual([a0.id])
		expect(turns[1]!.assistantMessages.map((m) => m.info.id)).toEqual([a1.id])
	})

	test("after handoff-style append of newer cli turns, order stays oldest→newest", () => {
		const prior = [
			msg({ id: "oc-1", role: "user", created: 100 }),
			msg({ id: "oc-2", role: "assistant", created: 200, parentID: "oc-1" }),
		]
		const afterSwitch = [
			msg({ id: "cli-900-0u", role: "user", created: 900 }),
			msg({ id: "cli-901-1a", role: "assistant", created: 901, parentID: "cli-900-0u" }),
		]
		// Simulate store: prior then append out-of-order
		const sorted = sortMessagesChronological([...afterSwitch, ...prior])
		const turns = groupIntoTurns(sorted.map(entry), [])
		expect(turns.map((t) => t.userMessage.info.time.created)).toEqual([100, 900])
	})
})
