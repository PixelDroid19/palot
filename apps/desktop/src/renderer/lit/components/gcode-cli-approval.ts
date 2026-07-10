/**
 * CLI permission approval panel — progressive Lit of CliApprovalBar chrome.
 * Parent React wires jotai + respondRuntimePermissionRequest via events.
 */
import { html, LitElement } from "lit"
import { customElement, property } from "lit/decorators.js"
import { styles } from "./gcode-cli-approval.css.js"

export interface CliApprovalRequestView {
	requestId: string
	name: string
	/** Fully resolved title string (i18n done by host). */
	title: string
	detail?: string
	reason?: string
	decisions: string[]
}

@customElement("gcode-cli-approval")
export class GcodeCliApprovalElement extends LitElement {
	static styles = styles

	@property({ type: String, attribute: "session-id" }) sessionId = ""
	@property({ attribute: false }) requests: CliApprovalRequestView[] = []
	@property({ type: String, attribute: "label-allow" }) labelAllow = "Allow"
	@property({ type: String, attribute: "label-allow-session" }) labelAllowSession =
		"Allow for session"
	@property({ type: String, attribute: "label-deny" }) labelDeny = "Deny"

	private emitDecision(requestId: string, decision: string): void {
		this.dispatchEvent(
			new CustomEvent("gcode-permission-decision", {
				detail: { sessionId: this.sessionId, requestId, decision },
				bubbles: true,
				composed: true,
			}),
		)
	}

	render() {
		if (!this.requests?.length) return html``
		return html`
			<div class="stack" data-slot="cli-approval">
				${this.requests.map(
					(request) => html`
						<div class="card">
							<div class="row">
								<svg
									class="icon"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									aria-hidden="true"
								>
									<path
										d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"
									/>
									<path d="M9.1 9a3 3 0 0 1 5.82 1c0 2-3 3-3 3" />
									<path d="M12 17h.01" />
								</svg>
								<div class="body">
									<div class="title">${request.title}</div>
									${
										request.detail
											? html`<code class="detail">${request.detail}</code>`
											: null
									}
									${
										request.reason
											? html`<div class="reason">${request.reason}</div>`
											: null
									}
								</div>
							</div>
							<div class="actions">
								<button
									type="button"
									@click=${() => this.emitDecision(request.requestId, "decline")}
								>
									${this.labelDeny}
								</button>
								${
									request.decisions?.includes("acceptForSession")
										? html`
												<button
													type="button"
													@click=${() =>
														this.emitDecision(request.requestId, "acceptForSession")}
												>
													${this.labelAllowSession}
												</button>
											`
										: null
								}
								<button
									type="button"
									class="primary"
									@click=${() => this.emitDecision(request.requestId, "accept")}
								>
									${this.labelAllow}
								</button>
							</div>
						</div>
					`,
				)}
			</div>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"gcode-cli-approval": GcodeCliApprovalElement
	}
}
