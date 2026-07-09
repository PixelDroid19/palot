import { describe, expect, test } from "bun:test"
import { sanitizeAgentError } from "../src/renderer/lib/sanitize-agent-error"

describe("sanitizeAgentError", () => {
	test("strips Electron IPC prefix from live QA Codex quota error", () => {
		const raw =
			"Error invoking remote method 'agent-session:prompt': Error: You've hit your usage limit for GPT-5.3-Codex-Spark. Switch to another model now, or try again at Jul 9th, 2026 1:47 AM."
		const out = sanitizeAgentError(raw)
		expect(out).not.toMatch(/Error invoking remote method/i)
		expect(out).not.toMatch(/^Error:/i)
		expect(out.toLowerCase()).toMatch(/usage limit|switch to another model/)
	})

	test("maps bare usage limit without recovery hint", () => {
		const out = sanitizeAgentError("Error: rate limit exceeded")
		expect(out).toMatch(/usage limit|model/i)
		expect(out).not.toMatch(/Error invoking/)
	})

	test("maps missing binary / ENOENT", () => {
		const out = sanitizeAgentError("spawn claude ENOENT")
		expect(out.toLowerCase()).toMatch(/not found|install|setup/)
	})

	test("maps auth failures", () => {
		const out = sanitizeAgentError("Error invoking remote method 'agent-session:prompt': Error: not authenticated")
		expect(out.toLowerCase()).toMatch(/auth|sign in/)
		expect(out).not.toMatch(/invoking remote/)
	})

	test("parses JSON error payloads", () => {
		const out = sanitizeAgentError(
			JSON.stringify({ error: { message: "You've hit your usage limit for model X" } }),
		)
		expect(out.toLowerCase()).toMatch(/usage limit/)
	})

	test("passes through unknown agent errors without inventing brands", () => {
		const out = sanitizeAgentError("Unknown agent runtime: custom-harness")
		expect(out).toBe("Unknown agent runtime: custom-harness")
	})
})
