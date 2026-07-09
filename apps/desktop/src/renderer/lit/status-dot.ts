/**
 * Public helpers for connection/health status dots (framework-free).
 */
export type HealthState = boolean | null

/** Visual state for a health/status indicator. */
export type StatusDotKind = "checking" | "ok" | "bad"

/**
 * Map boolean|null health to a stable visual kind.
 * null = still probing; true = healthy; false = unhealthy/offline.
 */
export function healthToStatusDotKind(health: HealthState): StatusDotKind {
	if (health === null) return "checking"
	return health ? "ok" : "bad"
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
