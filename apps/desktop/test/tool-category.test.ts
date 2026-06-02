import { describe, expect, test } from "bun:test"
import { getToolCategory, TOOL_CATEGORY_COLORS } from "../src/renderer/lib/tool-category"

describe("getToolCategory", () => {
	test("classifies explore tools", () => {
		expect(getToolCategory("read")).toBe("explore")
		expect(getToolCategory("grep")).toBe("explore")
	})

	test("classifies edit and run tools", () => {
		expect(getToolCategory("write")).toBe("edit")
		expect(getToolCategory("bash")).toBe("run")
	})

	test("defaults unknown tools to other", () => {
		expect(getToolCategory("unknown_tool")).toBe("other")
	})
})

describe("TOOL_CATEGORY_COLORS", () => {
	test("has a color entry for every category", () => {
		const categories = [
			"explore",
			"edit",
			"run",
			"delegate",
			"plan",
			"ask",
			"fetch",
			"other",
		] as const
		for (const category of categories) {
			expect(TOOL_CATEGORY_COLORS[category]).toBeTruthy()
		}
	})
})