/**
 * Public helpers for connection/health status dots (framework-free).
 * Coerces string wire values ("true"|"false"|"null") so the host path is safe.
 */
export type HealthState = boolean | null

/** Visual state for a health/status indicator. */
export type StatusDotKind = "checking" | "ok" | "bad"

/**
 * Normalize health from attribute strings, boolean, or null.
 * Host boundaries may set custom-element props as strings — never treat
 * "false"/"null" as truthy.
 */
export function coerceHealthState(value: unknown): HealthState {
	if (value === true || value === false) return value
	if (value === null || value === undefined) return null
	if (typeof value === "string") {
		const v = value.trim().toLowerCase()
		if (v === "" || v === "null" || v === "checking" || v === "undefined") return null
		if (v === "true" || v === "1" || v === "ok" || v === "online") return true
		if (v === "false" || v === "0" || v === "bad" || v === "offline") return false
		return null
	}
	return null
}

/**
 * Map health (boolean|null or string wire) to a stable visual kind.
 * null / "null" = still probing; true / "true" = healthy; false / "false" = offline.
 */
export function healthToStatusDotKind(health: unknown): StatusDotKind {
	const h = coerceHealthState(health)
	if (h === null) return "checking"
	return h ? "ok" : "bad"
}

/** Accessible label for the kind. */
export function statusDotKindLabel(kind: StatusDotKind): string {
	switch (kind) {
		case "checking":
			return "Checking"
		case "ok":
			return "Online"
		case "bad":
			return "Offline"
	}
}
