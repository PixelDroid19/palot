import { html, LitElement } from "lit"
import { customElement, property } from "lit/decorators.js"
import { styles } from "./palot-model-option.css.js"

export interface PalotModelOptionSelectedDetail {
	modelId: string
	providerId?: string
}

/**
 * palot-model-option
 *
 * Compact item for model selector dropdowns or lists.
 * Shows model name + optional provider.
 * Click emits palot-model-selected (bubbles composed).
 * Portable, token styles.
 */
@customElement("palot-model-option")
export class PalotModelOption extends LitElement {
	static styles = styles

	@property({ type: String, attribute: "model-id" })
	modelId = ""

	@property({ type: String, attribute: "provider-id" })
	providerId = ""

	@property({ type: Boolean })
	selected = false

	protected emitSelected = () => {
		this.dispatchEvent(
			new CustomEvent<PalotModelOptionSelectedDetail>("palot-model-selected", {
				bubbles: true,
				composed: true,
				detail: { modelId: this.modelId, providerId: this.providerId || undefined },
			}),
		)
	}

	render() {
		return html`
			<div
				class="opt ${this.selected ? "selected" : ""}"
				role="option"
				aria-selected=${this.selected}
				tabindex="0"
				@click=${this.emitSelected}
				@keydown=${(e: KeyboardEvent) => {
					if (e.key === "Enter" || e.key === " ") this.emitSelected()
				}}
			>
				<span class="model">${this.modelId}</span>
				${this.providerId ? html`<span class="prov">${this.providerId}</span>` : null}
			</div>
		`
	}
}

// Side-effect registration.
if (!customElements.get("palot-model-option")) {
	customElements.define("palot-model-option", PalotModelOption)
}

declare global {
	interface HTMLElementTagNameMap {
		"palot-model-option": PalotModelOption
	}
}
