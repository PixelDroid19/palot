import { html, LitElement } from "lit"
import { customElement, property } from "lit/decorators.js"
import { styles } from "./palot-status-badge.css.js"

export interface PalotStatusBadgeProps {
	status?: "idle" | "busy" | "waiting" | "error" | "aborted" | "completed"
	label?: string
}

/**
 * palot-status-badge
 * Compact status pill for sessions, runs, providers.
 * Receives status as attribute/property. Uses CSS host selectors for variants.
 * Emits no events (presentation only).
 */
@customElement("palot-status-badge")
export class PalotStatusBadge extends LitElement {
	static styles = styles

	@property({ type: String, reflect: true })
	status: "idle" | "busy" | "waiting" | "error" | "aborted" | "completed" = "idle"

	@property({ type: String })
	label = ""

	render() {
		const text = this.label || this.status
		return html`<span part="badge">${text}</span>`
	}
}

// Side-effect registration (guarded for test re-imports + happy-dom).
if (!customElements.get("palot-status-badge")) {
	customElements.define("palot-status-badge", PalotStatusBadge)
}

declare global {
	interface HTMLElementTagNameMap {
		"palot-status-badge": PalotStatusBadge
	}
}
