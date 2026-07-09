/**
 * Product wordmark — thin React host for progressive Lit `<gcode-wordmark>`.
 * Call sites keep Tailwind classes; SVG markup lives only in Lit.
 */
import { createElement } from "react"
import "../lit/components/gcode-wordmark"

export function GCodeWordmark({ className }: { className?: string }) {
	// Custom element: pass class for DOM + className for React.
	return createElement("gcode-wordmark", {
		class: className,
		className,
		"data-lit-wordmark": "1",
	})
}
