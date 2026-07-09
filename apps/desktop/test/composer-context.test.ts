import { describe, expect, test } from "bun:test"
import {
	appendFileContextToPrompt,
	insertFileContextAtCursor,
	mergeMentions,
	pathToFileMention,
	pathsToFileMentions,
} from "../src/renderer/lib/composer-context"

describe("composer file context", () => {
	test("pathToFileMention uses basename as displayName", () => {
		const m = pathToFileMention("/Users/me/proj/src/host.ts")
		expect(m.type).toBe("file")
		expect(m.path).toBe("/Users/me/proj/src/host.ts")
		expect(m.displayName).toBe("host.ts")
	})

	test("insertFileContextAtCursor replaces trailing @query", () => {
		const { text, mention } = insertFileContextAtCursor("Look at @ho", 10, "/repo/host.ts")
		expect(mention.displayName).toBe("host.ts")
		expect(text).toContain("@host.ts")
		expect(text).not.toMatch(/@ho$/)
	})

	test("appendFileContextToPrompt dedupes and appends paths from picker", () => {
		const first = appendFileContextToPrompt("Fix bugs", ["/a/one.ts", "/a/two.ts"])
		expect(first.text).toContain("@one.ts")
		expect(first.text).toContain("@two.ts")
		expect(first.mentions).toHaveLength(2)

		const second = appendFileContextToPrompt(first.text, ["/a/one.ts", "/a/three.ts"])
		expect(second.mentions.map((m) => m.displayName)).toEqual(["three.ts"])
		expect(second.text).toContain("@one.ts")
		expect(second.text).toContain("@three.ts")
	})

	test("pathsToFileMentions and mergeMentions", () => {
		const a = pathsToFileMentions(["/x/a.ts", "/x/a.ts"])
		expect(a).toHaveLength(1)
		const merged = mergeMentions(a, pathsToFileMentions(["/x/a.ts", "/x/b.ts"]))
		expect(merged).toHaveLength(2)
	})
})
