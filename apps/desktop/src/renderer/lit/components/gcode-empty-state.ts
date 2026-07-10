/**
 * Empty / error page shell matching ErrorPage & NotFoundPage layout.
 */
import { html, LitElement, nothing } from "lit"
import { customElement, property, state } from "lit/decorators.js"
import { styles } from "./gcode-empty-state.css.js"

@customElement("gcode-empty-state")
export class GcodeEmptyStateElement extends LitElement {
	static styles = styles

	@property({ type: String }) variant: "not-found" | "error" = "not-found"
	@property({ type: String }) heading = ""
	@property({ type: String }) message = ""
	@property({ type: String }) stack = ""
	@property({ type: String, attribute: "primary-label" }) primaryLabel = ""
	@property({ type: String, attribute: "secondary-label" }) secondaryLabel = ""

	@state() private showDetails = false

	private emit(action: "primary" | "secondary"): void {
		this.dispatchEvent(
			new CustomEvent("gcode-empty-action", {
				detail: { action },
				bubbles: true,
				composed: true,
			}),
		)
	}

	render() {
		return html`
			<div class="wrap" data-slot="empty-state" data-variant=${this.variant}>
				<div class="icon-wrap">
					<div class="icon-circle" data-variant=${this.variant === "error" ? "error" : "muted"}>
						${
							this.variant === "error"
								? html`
										<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
											<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
											<path d="M12 9v4" />
											<path d="M12 17h.01" />
										</svg>
									`
								: html`
										<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
											<path d="m13.5 8.5-5 5" />
											<path d="m8.5 8.5 5 5" />
											<circle cx="11" cy="11" r="8" />
											<path d="m21 21-4.3-4.3" />
										</svg>
									`
						}
					</div>
				</div>
				<div class="copy">
					<h1>${this.heading}</h1>
					<p>${this.message}</p>
				</div>
				<div class="actions">
					${
						this.primaryLabel
							? html`
									<button type="button" @click=${() => this.emit("primary")}>
										${
											this.variant === "error"
												? html`<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
														<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
														<path d="M21 3v5h-5" />
														<path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
														<path d="M8 16H3v5" />
													</svg>`
												: nothing
										}
										${this.primaryLabel}
									</button>
								`
							: nothing
					}
					${
						this.secondaryLabel
							? html`
									<button type="button" class="ghost" @click=${() => this.emit("secondary")}>
										${this.secondaryLabel}
									</button>
								`
							: nothing
					}
				</div>
				${
					this.stack
						? html`
								<div class="details">
									<button
										type="button"
										class="details-toggle"
										@click=${() => {
											this.showDetails = !this.showDetails
										}}
									>
										<svg
											class="chevron ${this.showDetails ? "open" : ""}"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"
											stroke-linejoin="round"
											aria-hidden="true"
										>
											<path d="m6 9 6 6 6-6" />
										</svg>
										${this.showDetails ? "Hide details" : "Show details"}
									</button>
									${
										this.showDetails
											? html`<pre class="stack"><code>${this.stack}</code></pre>`
											: nothing
									}
								</div>
							`
						: nothing
				}
			</div>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"gcode-empty-state": GcodeEmptyStateElement
	}
}
