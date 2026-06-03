import { html, LitElement } from "lit"
import { customElement, property } from "lit/decorators.js"
import { styles } from "./palot-automation-row.css.js"

export interface PalotAutomationActionDetail {
	automationId: string
	action: "run-now" | "cancel" | "view"
}

/**
 * palot-automation-row
 * Row for automation inbox or list. Emits action events.
 */
@customElement("palot-automation-row")
export class PalotAutomationRow extends LitElement {
	static styles = styles

	@property({ type: String, attribute: "automation-id" })
	automationId = ""

	@property({ type: String })
	status: "pending" | "running" | "succeeded" | "failed" | "cancelled" = "pending"

	@property({ type: String })
	title = ""

	private emit(action: PalotAutomationActionDetail["action"]) {
		this.dispatchEvent(
			new CustomEvent<PalotAutomationActionDetail>("palot-automation-action", {
				bubbles: true,
				composed: true,
				detail: { automationId: this.automationId, action },
			}),
		)
	}

	render() {
		return html`
			<span>${this.title || this.automationId}</span>
			<span class="status">${this.status}</span>
			<button type="button" @click=${() => this.emit("run-now")}>Run</button>
		`
	}
}

// Side-effect registration.
if (!customElements.get("palot-automation-row")) {
	customElements.define("palot-automation-row", PalotAutomationRow)
}

declare global {
	interface HTMLElementTagNameMap {
		"palot-automation-row": PalotAutomationRow
	}
}
