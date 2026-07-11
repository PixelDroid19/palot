/**
 * Progressive Lit tool-call chrome (header + collapsible body slot).
 * Icon / trailing / body content come from light-DOM slots.
 */
import { html, LitElement, nothing } from "lit"
import { customElement, property, state } from "lit/decorators.js"
import { isToolCardError, isToolCardRunning } from "../tool-category"
import { styles } from "./gcode-tool-card.css.js"

@customElement("gcode-tool-card")
export class GcodeToolCardElement extends LitElement {
	static styles = styles

	/** Avoid HTMLElement.title tooltip conflict */
	@property({ type: String, attribute: "card-title" }) cardTitle = ""
	@property({ type: String }) subtitle = ""
	@property({ type: String }) status: "running" | "error" | "completed" | "pending" | "" = ""
	@property({ type: Boolean, attribute: "has-content", reflect: true }) hasContent = false
	@property({ type: Boolean, attribute: "default-open", reflect: true }) defaultOpen = false
	@property({ type: Boolean, attribute: "force-open", reflect: true }) forceOpen = false

	@state() private open = false

	connectedCallback(): void {
		super.connectedCallback()
		this.open = this.defaultOpen || this.forceOpen
	}

	protected willUpdate(
		changed: Map<string, unknown>,
	): void {
		if (changed.has("forceOpen") && this.forceOpen) {
			this.open = true
		}
		if (changed.has("defaultOpen") && this.defaultOpen && !changed.has("forceOpen")) {
			// only seed open once when defaultOpen becomes true while closed
			if (!this.open && this.defaultOpen) this.open = true
		}
	}

	private toggle(): void {
		if (this.forceOpen || !this.hasContent) return
		this.open = !this.open
		this.dispatchEvent(
			new CustomEvent("gcode-tool-toggle", {
				detail: { open: this.open },
				bubbles: true,
				composed: true,
			}),
		)
	}

	private onHeaderKey(e: KeyboardEvent): void {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault()
			this.toggle()
		}
	}

	render() {
		const expandable = this.hasContent
		const showBody = expandable && (this.forceOpen || this.open)
		const running = isToolCardRunning(this.status)
		const error = isToolCardError(this.status)

		return html`
			<div
				class="card"
				data-slot="tool-card"
				data-error=${error ? "true" : "false"}
				data-running=${running ? "true" : "false"}
			>
				<div
					class="header"
					data-expandable=${expandable ? "true" : "false"}
					role=${expandable ? "button" : nothing}
					tabindex=${expandable ? 0 : nothing}
					aria-expanded=${expandable ? String(showBody) : nothing}
					@click=${() => this.toggle()}
					@keydown=${(e: KeyboardEvent) => this.onHeaderKey(e)}
				>
					${
						expandable
							? html`
									<svg
										class="chevron"
										data-open=${showBody ? "true" : "false"}
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
										aria-hidden="true"
									>
										<path d="m9 18 6-6-6-6" />
									</svg>
								`
							: nothing
					}
					<span class="icon"><slot name="icon"></slot></span>
					<span class="title">${this.cardTitle}</span>
					${
						this.subtitle
							? html`<span class="subtitle" title=${this.subtitle}>${this.subtitle}</span>`
							: html`<span class="grow"></span>`
					}
					<span class="trailing"><slot name="trailing"></slot></span>
				</div>
				<div class="body" ?hidden=${!showBody}>
					<slot></slot>
				</div>
			</div>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"gcode-tool-card": GcodeToolCardElement
	}
}
