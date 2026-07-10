import { afterEach, describe, expect, test } from "bun:test"
import {
	configureRuntimeComposition,
	getRuntimeComposition,
	resolveProcessAutomationIds,
	resolveProcessBuiltinIds,
} from "../src/main/agents/composition"

const defaultComposition = getRuntimeComposition()

afterEach(() => {
	configureRuntimeComposition(defaultComposition)
})

describe("runtime composition", () => {
	test("ships OpenCode as a process adapter for sessions and automation", () => {
		configureRuntimeComposition({
			processBuiltins: ["opencode"],
			processAutomation: ["opencode"],
			includeOpenCode: true,
		})

		expect(resolveProcessBuiltinIds()).toEqual(["opencode"])
		expect(resolveProcessAutomationIds()).toEqual(["opencode"])
	})

	test("unplugging OpenCode removes it from both process planes", () => {
		configureRuntimeComposition({
			processBuiltins: ["opencode"],
			processAutomation: ["opencode"],
			includeOpenCode: false,
		})

		expect(resolveProcessBuiltinIds()).toEqual([])
		expect(resolveProcessAutomationIds()).toEqual([])
	})
})
