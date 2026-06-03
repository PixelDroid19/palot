import { html, LitElement } from "lit"
import { customElement, property } from "lit/decorators.js"
import { styles } from "./palot-provider-icon.css.js"

export interface PalotProviderSelectedDetail {
	providerId: string
}

/**
 * palot-provider-icon
 *
 * Compact provider icon/avatar for settings, selectors, lists.
 * Uses text/symbol or simple colored dot + label for portability (no external assets).
 * Click emits palot-provider-selected (bubbles, composed).
 * Pure web, tokens only.
 */
@customElement("palot-provider-icon")
export class PalotProviderIcon extends LitElement {
	static styles = styles

	@property({ type: String, attribute: "provider-id" })
	providerId = ""

	@property({ type: String })
	label = ""

	@property({ type: Boolean })
	selected = false

	protected emitSelected = () => {
		this.dispatchEvent(
			new CustomEvent<PalotProviderSelectedDetail>("palot-provider-selected", {
				bubbles: true,
				composed: true,
				detail: { providerId: this.providerId },
			}),
		)
	}

	render() {
		const sym = (this.label || this.providerId).slice(0, 1).toUpperCase() || "?"
		return html`
			<button
				type="button"
				class="icon ${this.selected ? "selected" : ""}"
				@click=${this.emitSelected}
				aria-label=${this.label || this.providerId}
				aria-pressed=${this.selected}
			>
				<span class="sym" aria-hidden="true">${sym}</span>
				${this.label ? html`<span class="label">${this.label}</span>` : null}
			</button>
		`
	}
}

// Side-effect registration (guarded for test multi-import + hot reload).
if (!customElements.get("palot-provider-icon")) {
	customElements.define("palot-provider-icon", PalotProviderIcon)
}

declare global {
	interface HTMLElementTagNameMap {
		"palot-provider-icon": PalotProviderIcon
	}
}
