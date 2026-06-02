/**
 * URL helpers for demo/mock mode (`?mock=1`).
 * Works with hash-router URLs used by the desktop renderer.
 */

/** Parse mock flag from a URL string (hash or search). */
export function isMockModeUrl(url: string): boolean {
	try {
		const parsed = new URL(url, "http://localhost")
		const hash = parsed.hash
		const search = hash.includes("?") ? hash.slice(hash.indexOf("?")) : parsed.search
		const params = new URLSearchParams(search)
		return params.get("mock") === "1"
	} catch {
		return false
	}
}

/** Append or merge `mock=1` onto a hash-router path. */
export function withMockParam(path: string): string {
	const normalized = path.startsWith("/") ? path : `/${path}`
	const sep = normalized.includes("?") ? "&" : "?"
	return `${normalized}${sep}mock=1`
}