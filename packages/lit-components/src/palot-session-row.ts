import { html, LitElement } from "lit"
import { customElement, property } from "lit/decorators.js"
import { styles } from "./palot-session-row.css.js"

/**
 * Detail payload for the palot-session-selected event.
 */
export interface PalotSessionSelectedDetail {
	/** Stable session identifier. */
	sessionId: string
}

/**
 * palot-session-row
 *
 * Reusable leaf component for rendering a session row in sidebars or lists.
 * Receives data exclusively via properties.
 * Emits `palot-session-selected` (bubbles, composed) on activation (click/keyboard).
 *
 * Styles come from generated css.js using only Palot design tokens.
 * Portable: no React, no Jotai, no Electron, no Node, no provider SDKs.
 */
@customElement("palot-session-row")
export class PalotSessionRow extends LitElement {
	static styles = styles

	@property({ type: String, attribute: "session-id" })
	sessionId = ""

	@property({ type: String })
	title = "Untitled"

	@property({ type: String })
	status = "idle"

	@property({ type: Boolean })
	active = false

	protected emitSelected = () => {
		this.dispatchEvent(
			new CustomEvent<PalotSessionSelectedDetail>("palot-session-selected", {
				bubbles: true,
				composed: true,
				detail: { sessionId: this.sessionId },
			}),
		)
	}

	render() {
		return html`
			<div
				class="row ${this.active ? "active" : ""}"
				@click=${this.emitSelected}
				role="button"
				tabindex="0"
				@keydown=${(e: KeyboardEvent) => {
					if (e.key === "Enter" || e.key === " ") {
						this.emitSelected()
					}
				}}
				aria-pressed=${this.active}
			>
				<span class="title">${this.title}</span>
				<span class="status">${this.status}</span>
			</div>
		`
	}
}

// Side-effect registration for custom element (importing the module registers it).
if (!customElements.get("palot-session-row")) {
	customElements.define("palot-session-row", PalotSessionRow)
}

declare global {
	interface HTMLElementTagNameMap {
		"palot-session-row": PalotSessionRow
	}
}
