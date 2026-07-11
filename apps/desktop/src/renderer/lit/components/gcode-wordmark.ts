/**
 * Product wordmark — progressive Lit migration of GCodeWordmark.
 * Inherits color and size from the Lit host token surface.
 */
import { html, LitElement } from "lit"
import { customElement } from "lit/decorators.js"
import {
	WORDMARK_FONT_FAMILY,
	WORDMARK_LABEL,
	WORDMARK_VIEWBOX,
} from "../wordmark"
import { styles } from "./gcode-wordmark.css.js"

@customElement("gcode-wordmark")
export class GcodeWordmarkElement extends LitElement {
	static styles = styles

	render() {
		return html`
			<svg
				viewBox=${WORDMARK_VIEWBOX}
				fill="none"
				xmlns="http://www.w3.org/2000/svg"
				aria-hidden="true"
				role="img"
			>
				<title>${WORDMARK_LABEL}</title>
				<text x="0" y="22" font-family=${WORDMARK_FONT_FAMILY}>
					${WORDMARK_LABEL}
				</text>
			</svg>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"gcode-wordmark": GcodeWordmarkElement
	}
}
