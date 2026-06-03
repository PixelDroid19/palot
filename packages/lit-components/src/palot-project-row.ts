import { html, LitElement } from "lit"
import { customElement, property } from "lit/decorators.js"
import { styles } from "./palot-project-row.css.js"

/**
 * Detail payload for the palot-project-selected event (emitted for future use).
 */
export interface PalotProjectSelectedDetail {
	/** Project/workspace name. */
	name: string
}

/**
 * palot-project-row
 *
 * Leaf component for a project/workspace row in trees or lists.
 * Receives data via properties only.
 * (Currently presentation-only; can emit palot-project-selected on click in future.)
 *
 * Uses generated token-based styles. Pure web component, portable across hosts.
 */
@customElement("palot-project-row")
export class PalotProjectRow extends LitElement {
	static styles = styles

	@property({ type: String })
	name = ""

	@property({ type: Number })
	agentCount = 0

	render() {
		return html`
			<div class="row" role="listitem" aria-label=${this.name || "project"}>
				<span class="name">${this.name}</span>
				<span class="count">${this.agentCount} agents</span>
			</div>
		`
	}
}

// Side-effect registration.
if (!customElements.get("palot-project-row")) {
	customElements.define("palot-project-row", PalotProjectRow)
}

declare global {
	interface HTMLElementTagNameMap {
		"palot-project-row": PalotProjectRow
	}
}
