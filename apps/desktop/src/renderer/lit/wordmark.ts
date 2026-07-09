/**
 * Public constants for the GCode wordmark (framework-free).
 * Used by Lit element and unit tests — not React-specific.
 */
export const WORDMARK_LABEL = "GCode" as const

/** SVG viewBox matching the product wordmark geometry. */
export const WORDMARK_VIEWBOX = "0 0 120 28" as const

/** Monospace stack used so the name never falls back to legacy glyph outlines. */
export const WORDMARK_FONT_FAMILY =
	"ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" as const
