/**
 * Map agent-session / IPC failures to short product copy.
 * Unit-tested against real strings from live QA (Electron IPC + provider quotas).
 */

const IPC_PREFIX =
	/^Error invoking remote method\s+['"][^'"]+['"]:\s*(?:Error:\s*)?/i

const USAGE_LIMIT =
	/usage limit|hit your usage limit|rate limit|quota/i

const AUTH =
	/not authenticated|unauthenticated|login required|auth(?:entication)? (?:failed|required)|invalid api key|401\b|403\b/i

const BINARY =
	/not found|ENOENT|spawn .* ENOENT|binary not found|command not found|not installed/i

const TIMEOUT = /timed? ?out|ETIMEDOUT|deadline exceeded/i

const NETWORK = /ECONNREFUSED|ENOTFOUND|network|fetch failed|socket hang up/i

/**
 * Strip Electron IPC wrappers and map common failures to human-readable text.
 * Unknown errors pass through (trimmed) without inventing a substitute brand.
 */
export function sanitizeAgentError(raw: string): string {
	let text = raw.trim()
	if (!text) return "Something went wrong."

	// Nested JSON error payloads (CLI stderr wrapped as JSON)
	if (text.startsWith("{") || text.startsWith("[")) {
		try {
			const parsed = JSON.parse(text) as Record<string, unknown>
			const nested =
				pickString(parsed, ["message"]) ??
				pickNestedMessage(parsed) ??
				(typeof parsed.error === "string" ? parsed.error : null)
			if (nested) text = nested.trim()
		} catch {
			// keep original
		}
	}

	// Electron: Error invoking remote method 'agent-session:prompt': Error: ...
	text = text.replace(IPC_PREFIX, "").trim()
	// Remaining leading "Error: "
	text = text.replace(/^Error:\s*/i, "").trim()

	if (!text) return "Something went wrong."

	if (USAGE_LIMIT.test(text)) {
		// Keep the provider's recovery hint when present (e.g. "try again at …").
		const cleaned = text.replace(/^Error:\s*/i, "").trim()
		if (/switch to another model|try again/i.test(cleaned)) return cleaned
		return "You've hit a model usage limit. Switch models or try again later."
	}

	if (AUTH.test(text)) {
		return "Authentication required. Sign in for this runtime in Settings → Setup or the provider CLI."
	}

	if (BINARY.test(text) && !USAGE_LIMIT.test(text)) {
		return "This runtime's CLI was not found. Install it or check Settings → Setup."
	}

	if (TIMEOUT.test(text)) {
		return "The agent timed out. Try again, or switch runtime."
	}

	if (NETWORK.test(text)) {
		return "Could not reach the agent or managed server. Check connection and try again."
	}

	// Unknown agent runtime / no executor
	if (/unknown agent runtime|no automation executor|unknown host tool/i.test(text)) {
		return text
	}

	return text
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
	for (const key of keys) {
		const v = obj[key]
		if (typeof v === "string" && v.trim()) return v
	}
	return null
}

function pickNestedMessage(obj: Record<string, unknown>): string | null {
	const err = obj.error
	if (!err || typeof err !== "object") return null
	const e = err as Record<string, unknown>
	if (typeof e.message === "string" && e.message.trim()) return e.message
	const inner = e.error
	if (inner && typeof inner === "object") {
		const m = (inner as Record<string, unknown>).message
		if (typeof m === "string" && m.trim()) return m
	}
	return null
}
