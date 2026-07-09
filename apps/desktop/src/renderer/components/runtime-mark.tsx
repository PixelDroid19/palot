/**
 * Session runtime identity mark — thin React host for progressive Lit
 * `<gcode-runtime-mark>`. SVG path markup lives only in Lit.
 */
import { createElement, memo } from "react"
import "../lit/components/gcode-runtime-mark"

export interface RuntimeMarkProps {
	runtimeId?: string | null
	/** Agent status: running | waiting | failed | idle | … */
	status?: string | null
	/** Accessible name; defaults to runtime display label. */
	label?: string
	className?: string
	/** Pixel size (default 14 for sidebar density). */
	size?: number
}

/**
 * Session runtime identity mark — official brand SVG + status-driven animation.
 */
export const RuntimeMark = memo(function RuntimeMark({
	runtimeId,
	status,
	label,
	className,
	size = 14,
}: RuntimeMarkProps) {
	return createElement("gcode-runtime-mark", {
		class: className,
		className,
		"runtime-id": runtimeId ?? "",
		status: status ?? "",
		label: label ?? "",
		size,
		"data-lit-runtime-mark": "1",
	})
})
