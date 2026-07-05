import { describe, expect, test } from "bun:test"
import { AVAILABLE_LOCALES, interpolate, translate } from "../src/renderer/i18n"

describe("interpolate", () => {
	test("replaces named placeholders", () => {
		expect(interpolate("{{a}} in · {{b}} out", { a: 10, b: 2 })).toBe("10 in · 2 out")
	})
	test("leaves unknown placeholders untouched", () => {
		expect(interpolate("hi {{name}}", {})).toBe("hi {{name}}")
	})
	test("returns the template unchanged when no params are given", () => {
		expect(interpolate("no params here")).toBe("no params here")
	})
})

describe("translate", () => {
	test("resolves a dot-path key from the base locale", () => {
		expect(translate("en", "subagent.title")).toBe("Agent subagent")
	})
	test("interpolates params into the resolved string", () => {
		expect(translate("en", "subagent.usage", { input: 1200, output: 34 })).toBe(
			"1200 in · 34 out tokens",
		)
	})
	test("falls back to the key itself for an unknown path", () => {
		// @ts-expect-error -- intentionally passing an unknown key to test the fallback
		expect(translate("en", "does.not.exist")).toBe("does.not.exist")
	})
})

describe("registry", () => {
	test("English is always available", () => {
		expect(AVAILABLE_LOCALES).toContain("en")
	})
})
