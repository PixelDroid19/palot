import { html, LitElement } from "lit"
import { customElement, property } from "lit/decorators.js"
import { styles } from "./palot-question-item.css.js"

export interface PalotQuestionRepliedDetail {
	requestId: string
	optionId?: string
	text?: string
}

/**
 * palot-question-item
 * Agent clarifying question with optional choices.
 * Emits palot-question-replied on selection or free text (simple).
 */
@customElement("palot-question-item")
export class PalotQuestionItem extends LitElement {
	static styles = styles

	@property({ type: String, attribute: "request-id" })
	requestId = ""

	@property({ type: String })
	prompt = ""

	@property({ type: Array })
	options?: Array<{ id: string; label: string }>

	private reply(opt?: { id: string; label: string }, text?: string) {
		this.dispatchEvent(
			new CustomEvent<PalotQuestionRepliedDetail>("palot-question-replied", {
				bubbles: true,
				composed: true,
				detail: { requestId: this.requestId, optionId: opt?.id, text },
			}),
		)
	}

	render() {
		return html`
			<div class="prompt">${this.prompt}</div>
			${
				this.options?.length
					? html`
						<div class="options">
							${this.options.map(
								(o) =>
									html`<button type="button" @click=${() => this.reply(o)}>
										${o.label}
									</button>`,
							)}
						</div>
					`
					: html`<input placeholder="Your answer..." @change=${(e: Event) => this.reply(undefined, (e.target as HTMLInputElement).value)} />`
			}
		`
	}
}

// Side-effect registration.
if (!customElements.get("palot-question-item")) {
	customElements.define("palot-question-item", PalotQuestionItem)
}

declare global {
	interface HTMLElementTagNameMap {
		"palot-question-item": PalotQuestionItem
	}
}
