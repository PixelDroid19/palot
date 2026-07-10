import { describe, expect, test } from "bun:test"
import { renderSafeMarkdown } from "../src/renderer/lit/markdown"

describe("Lit Markdown renderer", () => {
	test("renders useful agent Markdown while escaping raw HTML", () => {
		const output = renderSafeMarkdown("# Plan\n\n- **safe** `code`\n\n```ts\nconst x = '<script>'\n```")
		expect(output).toContain("<h1>Plan</h1>")
		expect(output).toContain("<strong>safe</strong>")
		expect(output).toContain("<code>code</code>")
		expect(output).toContain("&lt;script&gt;")
		expect(output).not.toContain("<script>")
	})
})
