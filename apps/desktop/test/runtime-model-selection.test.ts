import { describe, expect, test } from "bun:test"
import type { AgentRuntimeDescriptor } from "../src/preload/api"
import {
	availableRuntimeModels,
	resolveRuntimeEffort,
	resolveRuntimeModel,
} from "../src/renderer/lib/runtime-model-selection"

function descriptor(
	id: AgentRuntimeDescriptor["id"],
	models: AgentRuntimeDescriptor["models"],
): AgentRuntimeDescriptor {
	return {
		id,
		displayName: id,
		installed: true,
		capabilities: {
			imageInput: true,
			reasoningEffort: true,
			resume: true,
			permissions: true,
			interrupt: true,
			steering: true,
		},
		models,
	}
}

describe("runtime-model-selection", () => {
	test("drops synthetic empty-slug entries from runtime catalogs", () => {
		const models = availableRuntimeModels(
			descriptor("codex", [
				{ slug: "", label: "Default", efforts: ["low", "medium"], defaultEffort: "medium" },
				{ slug: "gpt-5.5", label: "GPT-5.5", efforts: ["low", "medium"], defaultEffort: "medium" },
			]),
		)

		expect(models.map((model) => model.slug)).toEqual(["gpt-5.5"])
	})

	test("uses the first concrete Codex model from the runtime catalog", () => {
		const models = descriptor("codex", [
			{ slug: "", label: "Default", efforts: ["low", "medium"], defaultEffort: "medium" },
			{ slug: "gpt-5.5", label: "GPT-5.5", efforts: ["low", "medium"], defaultEffort: "medium" },
			{ slug: "gpt-5.4-mini", label: "GPT-5.4-Mini", efforts: ["low", "medium"], defaultEffort: "medium" },
		])

		expect(resolveRuntimeModel(models, undefined)).toBe("gpt-5.5")
	})

	test("keeps a valid explicit runtime model selection", () => {
		const models = descriptor("codex", [
			{ slug: "gpt-5.5", label: "GPT-5.5", efforts: ["low", "medium"], defaultEffort: "medium" },
			{ slug: "gpt-5.4-mini", label: "GPT-5.4-Mini", efforts: ["low", "medium"], defaultEffort: "medium" },
		])

		expect(resolveRuntimeModel(models, "gpt-5.4-mini")).toBe("gpt-5.4-mini")
	})

	test("uses the first concrete Claude model from the runtime catalog", () => {
		const models = descriptor("claude", [
			{ slug: "fable", label: "Fable", efforts: ["low", "medium", "high"] },
			{ slug: "sonnet", label: "Sonnet", efforts: ["low", "medium", "high"] },
			{ slug: "opus", label: "Opus", efforts: ["low", "medium", "high"] },
		])

		expect(resolveRuntimeModel(models, undefined)).toBe("fable")
	})

	test("drops invalid efforts when the resolved model does not support them", () => {
		const models = descriptor("codex", [
			{ slug: "gpt-5.5", label: "GPT-5.5", efforts: ["low", "medium"], defaultEffort: "medium" },
			{ slug: "gpt-5.4-mini", label: "GPT-5.4-Mini", efforts: ["low"], defaultEffort: "low" },
		])

		expect(resolveRuntimeEffort(models, "gpt-5.4-mini", "medium")).toBeUndefined()
		expect(resolveRuntimeEffort(models, "gpt-5.5", "medium")).toBe("medium")
	})
})
