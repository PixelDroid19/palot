/**
 * E2E route and session constants (aligned with mock-data.ts IDs).
 * Do not assert on user-visible copy — use test ids and URLs from selectors.ts.
 */

export const PALOT_SERVER_URL = "http://localhost:3100"

/** Hash-router home with demo fixtures */
export const MOCK_HOME = "/#/?mock=1"

/** Matches agents.ts: `${name}-${projectId.slice(0, 12)}` for mock palot project */
export const MOCK_PROJECT_SLUG = "palot-proj-a1b2c3d"
export const MOCK_SESSION_DARK_MODE = "ses-mock-darkmode-001"
export const MOCK_SESSION_AUTH_FIX = "ses-mock-authfix-002"

export const MOCK_SESSION_DARK_MODE_PATH = `/project/${MOCK_PROJECT_SLUG}/session/${MOCK_SESSION_DARK_MODE}`

/** Build a hash-router path with ?mock=1 */
export function mockPath(path = "/"): string {
	const normalized = path.startsWith("/") ? path : `/${path}`
	const sep = normalized.includes("?") ? "&" : "?"
	return `/#${normalized}${sep}mock=1`
}

/** Regex for session id in hash URL */
export function sessionUrlPattern(sessionId: string): RegExp {
	return new RegExp(`session/${sessionId}`)
}
