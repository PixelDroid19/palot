/**
 * Structural + pure tests for the unified capability-driven toolbar grammar.
 * Exercises shipped pure builders used for OpenCode / Codex / Claude slots.
 */
import { describe, expect, test } from "bun:test"
import {
	buildProcessToolbarSectionsFromCatalog,
	buildToolbarSectionsFromSlots,
	type RuntimeToolbarSections,
} from "../src/renderer/components/chat/runtime-toolbar-sections"

const NOOP = () => {}

describe("unified toolbar slot order (all runtimes)", () => {
	test("slot key order is always agent → model → variant → sandbox → effort", () => {
		const full: RuntimeToolbarSections = {
			agent: {
				agents: [{ name: "build" }],
				selectedAgent: "build",
				onSelectAgent: NOOP,
			},
			model: {
				items: [{ value: "m", label: "M" }],
				value: "m",
				onValueChange: NOOP,
			},
			variant: {
				variants: ["high"],
				selectedVariant: "high",
				onSelectVariant: NOOP,
			},
			sandbox: {
				value: "read-only",
				onValueChange: NOOP,
			},
			effort: {
				efforts: ["low", "high"],
				value: "high",
				onValueChange: NOOP,
			},
		}
		const built = buildToolbarSectionsFromSlots(full)
		expect(Object.keys(built)).toEqual(["agent", "model", "variant", "sandbox", "effort"])
	})

	test("managed-server (OpenCode-style) keeps agent + model + variant; omits sandbox/effort", () => {
		const sections: RuntimeToolbarSections = {
			agent: {
				agents: [{ name: "build" }],
				selectedAgent: "build",
				onSelectAgent: NOOP,
			},
			model: {
				items: [
					{
						value: "anthropic/claude-sonnet",
						label: "Sonnet",
						group: "Anthropic",
					},
				],
				value: "anthropic/claude-sonnet",
				onValueChange: NOOP,
			},
			variant: {
				variants: ["high"],
				selectedVariant: "high",
				onSelectVariant: NOOP,
			},
		}
		const built = buildToolbarSectionsFromSlots(sections)
		expect(built.agent).toBeDefined()
		expect(built.model).toBeDefined()
		expect(built.variant).toBeDefined()
		expect(built.sandbox).toBeUndefined()
		expect(built.effort).toBeUndefined()
	})

	test("Codex process catalog → model + sandbox + effort (no agent slot)", () => {
		const sections = buildProcessToolbarSectionsFromCatalog({
			models: [
				{
					slug: "o3",
					label: "o3",
					efforts: ["low", "medium", "high"],
					defaultEffort: "medium",
				},
			],
			modelValue: "o3",
			onModelChange: NOOP,
			sandboxValue: "read-only",
			onSandboxChange: NOOP,
			efforts: ["low", "medium", "high"],
			effortValue: "high",
			onEffortChange: NOOP,
		})
		const built = buildToolbarSectionsFromSlots(sections)
		expect(built.agent).toBeUndefined()
		expect(built.model?.items[0]?.value).toBe("o3")
		expect(built.sandbox?.value).toBe("read-only")
		expect(built.effort?.efforts).toEqual(["low", "medium", "high"])
		expect(built.variant).toBeUndefined()
	})

	test("Claude process catalog uses same slot keys as Codex", () => {
		const sections = buildProcessToolbarSectionsFromCatalog({
			models: [
				{ slug: "sonnet", label: "Sonnet", efforts: ["low", "medium", "high", "max"] },
				{ slug: "opus", label: "Opus", efforts: ["low", "medium", "high", "max"] },
			],
			modelValue: "sonnet",
			onModelChange: NOOP,
			sandboxValue: "plan",
			onSandboxChange: NOOP,
			efforts: ["low", "medium", "high", "max"],
			effortValue: "high",
			onEffortChange: NOOP,
		})
		const built = buildToolbarSectionsFromSlots(sections)
		const present = Object.keys(built).filter((k) => built[k as keyof typeof built])
		expect(present).toEqual(["model", "sandbox", "effort"])
	})

	test("empty model catalog keeps slot when emptyLabel is set", () => {
		const sections = buildProcessToolbarSectionsFromCatalog({
			models: [],
			modelValue: null,
			onModelChange: NOOP,
			sandboxValue: "read-only",
			onSandboxChange: NOOP,
			efforts: [],
			effortValue: "",
			onEffortChange: NOOP,
		})
		const built = buildToolbarSectionsFromSlots(sections)
		expect(built.model?.emptyLabel).toBe("No models reported")
		expect(built.effort).toBeUndefined()
	})
})
