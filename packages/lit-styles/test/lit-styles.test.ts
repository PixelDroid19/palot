import { describe, expect, test } from "bun:test"

import { palotLitScss } from "../src/index"

describe("lit-styles", () => {
	test("exports vite plugin factory", () => {
		const plugin = palotLitScss()
		expect(plugin).toBeDefined()
		expect(plugin.name).toBe("palot-lit-scss")
		expect(typeof plugin.buildStart).toBe("function")
	})
})
