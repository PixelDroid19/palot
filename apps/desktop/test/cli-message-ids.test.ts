import { describe, expect, test } from "bun:test"

/**
 * The message store keeps a per-session array sorted by id (localeCompare) and
 * turn grouping collects assistant messages that FOLLOW their user message.
 * CLI message ids must therefore sort chronologically and user-before-
 * assistant within a turn. Regression test for the "response never renders"
 * bug caused by `cli-asst-*` sorting before `cli-user-*`.
 */
describe("CLI message id ordering", () => {
	const userId = (ts: number) => `cli-${ts}-0u`
	const asstId = (ts: number) => `cli-${ts}-1a`

	test("user sorts before its assistant reply within a turn", () => {
		expect(userId(1000).localeCompare(asstId(1000))).toBeLessThan(0)
	})

	test("turns sort chronologically", () => {
		const ids = [asstId(2000), userId(1000), userId(2000), asstId(1000)]
		ids.sort((a, b) => a.localeCompare(b))
		expect(ids).toEqual([userId(1000), asstId(1000), userId(2000), asstId(2000)])
	})
})
