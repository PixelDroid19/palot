import { html, LitElement } from "lit"
import { customElement, property } from "lit/decorators.js"
import { styles } from "./palot-permission-item.css.js"

export interface PalotPermissionRespondedDetail {
	requestId: string
	response: "allow" | "deny"
}

/**
 * palot-permission-item
 * Single permission request card. Shows tool + args.
 * Emits palot-permission-responded with response when user clicks allow/deny.
 * Bubbles + composed per contract.
 */
@customElement("palot-permission-item")
export class PalotPermissionItem extends LitElement {
	static styles = styles

	@property({ type: String, attribute: "request-id" })
	requestId = ""

	@property({ type: String })
	tool = ""

	@property({ type: Object })
	args?: Record<string, unknown>

	private respond(response: "allow" | "deny") {
		this.dispatchEvent(
			new CustomEvent<PalotPermissionRespondedDetail>("palot-permission-responded", {
				bubbles: true,
				composed: true,
				detail: { requestId: this.requestId, response },
			}),
		)
	}

	render() {
		return html`
			<div class="header">
				<span class="tool">${this.tool}</span>
			</div>
			${this.args ? html`<pre class="args">${JSON.stringify(this.args, null, 2)}</pre>` : null}
			<div class="actions">
				<button part="allow" type="button" @click=${() => this.respond("allow")}>Allow</button>
				<button part="deny" type="button" @click=${() => this.respond("deny")}>Deny</button>
			</div>
		`
	}
}

// Side-effect registration.
if (!customElements.get("palot-permission-item")) {
	customElements.define("palot-permission-item", PalotPermissionItem)
}

declare global {
	interface HTMLElementTagNameMap {
		"palot-permission-item": PalotPermissionItem
	}
}
