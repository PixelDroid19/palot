/**
 * Runtime identity marks for session pills/tabs.
 *
 * Registry-keyed by runtimeId (not product layout forks). New harnesses add an
 * entry + SVG; unknown ids fall back to a neutral glyph.
 *
 * Primary brand paths come from models.dev logos (anthropic, openai, opencode) —
 * the same CDN used by ProviderIcon — rendered inline for offline/animation.
 */

/** Stable public icon keys used by the SVG component map. */
export type RuntimeIconKey = "opencode" | "codex" | "claude" | "fallback"

/**
 * Animation variants for the brand mark itself (not a separate spinner).
 * - idle: static mark
 * - busy: continuous motion (running agent)
 * - waiting: attention pulse (approval/question)
 * - failed: static with error emphasis class
 */
export type RuntimeIconAnimation = "idle" | "busy" | "waiting" | "failed"

/** Known primary runtime ids → icon keys. Extensible registry. */
const RUNTIME_ICON_REGISTRY: Readonly<Record<string, RuntimeIconKey>> = {
	opencode: "opencode",
	codex: "codex",
	claude: "claude",
}

/**
 * Resolve runtimeId to a stable icon key. Unknown / empty → fallback.
 * Pure — unit-tested without React.
 */
export function runtimeIdToIconKey(runtimeId: string | null | undefined): RuntimeIconKey {
	const id = (runtimeId ?? "").trim().toLowerCase()
	if (!id) return "fallback"
	return RUNTIME_ICON_REGISTRY[id] ?? "fallback"
}

/**
 * Map session agent status to icon animation. Brand mark stays visible;
 * CSS classes animate the same SVG.
 */
export function sessionStatusToIconAnimation(
	status: string | null | undefined,
): RuntimeIconAnimation {
	switch (status) {
		case "running":
			return "busy"
		case "waiting":
			return "waiting"
		case "failed":
			return "failed"
		default:
			// idle | completed | paused | unknown
			return "idle"
	}
}

/** Tailwind / utility classes applied to the mark wrapper. */
export function iconAnimationClassName(animation: RuntimeIconAnimation): string {
	switch (animation) {
		case "busy":
			return "animate-spin"
		case "waiting":
			return "animate-pulse"
		case "failed":
			return "opacity-90"
		default:
			return ""
	}
}

/** Whether the mark should show motion (for tests / a11y). */
export function iconAnimationIsActive(animation: RuntimeIconAnimation): boolean {
	return animation === "busy" || animation === "waiting"
}

/** Register or override an icon key for a runtime (plugins / tests). */
export function resolveRegisteredIconKey(
	runtimeId: string | null | undefined,
	extra?: Readonly<Record<string, RuntimeIconKey>>,
): RuntimeIconKey {
	const id = (runtimeId ?? "").trim().toLowerCase()
	if (!id) return "fallback"
	if (extra?.[id]) return extra[id]!
	return runtimeIdToIconKey(id)
}
