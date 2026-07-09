/**
 * Inline SVG wordmark for "GCode" — renders at currentColor, no font dependency.
 *
 * Uses a monospaced system stack so the product name is always readable as GCode
 * (never legacy product glyph outlines).
 */
export function GCodeWordmark({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 120 28"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			className={className}
			style={{ overflow: "visible" }}
			aria-hidden="true"
			role="img"
		>
			<title>GCode</title>
			<text
				x="0"
				y="22"
				fill="currentColor"
				fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
				fontSize="22"
				fontWeight="800"
				letterSpacing="1.2"
			>
				GCode
			</text>
		</svg>
	)
}
