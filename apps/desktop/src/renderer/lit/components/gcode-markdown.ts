/**
 * Small, safe Markdown renderer for Lit chat messages.
 * Input HTML is always escaped before the supported Markdown subset is
 * transformed, so agent output cannot inject renderer markup.
 */
import { html, LitElement } from "lit"
import { customElement, property } from "lit/decorators.js"
import { unsafeHTML } from "lit/directives/unsafe-html.js"
import { renderSafeMarkdown } from "../markdown"
import { styles } from "./gcode-markdown.css.js"

@customElement("gcode-markdown")
export class GcodeMarkdown extends LitElement {
	static styles = styles

	@property({ type: String }) source = ""

	render() {
		return html`${unsafeHTML(renderSafeMarkdown(this.source))}`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"gcode-markdown": GcodeMarkdown
	}
}
