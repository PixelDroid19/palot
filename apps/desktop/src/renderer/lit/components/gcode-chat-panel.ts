/**
 * Chat surface: messages, tool cards, permission gate, question gate, composer.
 */
import { html, LitElement } from "lit"
import { customElement, property } from "lit/decorators.js"
import type {
	LitPermissionDecision,
	LitPermissionRequest,
	LitQuestionRequest,
	LitToolEvent,
} from "../chat-runtime"
import { LocaleController } from "../locale-controller"
import "./gcode-composer"
import "./gcode-markdown"
import { styles } from "./gcode-chat-panel.css.js"

export interface ChatMessageView {
	id: string
	role: "user" | "assistant" | "system"
	text: string
}

@customElement("gcode-chat-panel")
export class GcodeChatPanel extends LitElement {
	static styles = styles
	private locale = new LocaleController(this)

	@property({ type: String }) title = "GCode"
	@property({ type: String, attribute: "runtime-id" }) runtimeId = ""
	@property({ attribute: false }) messages: ChatMessageView[] = []
	@property({ attribute: false }) tools: LitToolEvent[] = []
	@property({ attribute: false }) permission: LitPermissionRequest | null = null
	@property({ attribute: false }) question: LitQuestionRequest | null = null
	@property({ type: Boolean }) busy = false

	private emitPermission(decision: LitPermissionDecision): void {
		if (!this.permission) return
		this.dispatchEvent(
			new CustomEvent("gcode-permission", {
				detail: { requestId: this.permission.requestId, decision },
				bubbles: true,
				composed: true,
			}),
		)
	}

	private emitQuestionAnswer(questionText: string, label: string): void {
		if (!this.question) return
		this.dispatchEvent(
			new CustomEvent("gcode-question-answer", {
				detail: {
					requestId: this.question.requestId,
					answers: { [questionText]: label },
				},
				bubbles: true,
				composed: true,
			}),
		)
	}

	render() {
		const empty = this.messages.length === 0 && this.tools.length === 0
		return html`
			${
				empty
					? html`
							<div class="empty">
								<div>
									<h2>${this.locale.t("litShell.welcomeTitle")}</h2>
									<p>${this.locale.t("litShell.welcomeBody")}</p>
								</div>
							</div>
						`
					: html`
							<div class="messages" role="log">
								${this.messages.map(
									(m) => html`
										<div class="msg" data-role=${m.role}>
											<div class="msg-role">
												${
													m.role === "user"
														? this.locale.t("subagentChat.you")
														: m.role === "assistant"
															? this.runtimeId || "agent"
															: "system"
												}
											</div>
											<div class="msg-body">
												${m.role === "assistant"
													? html`<gcode-markdown source=${m.text}></gcode-markdown>`
													: m.text}
											</div>
										</div>
									`,
								)}
								${this.tools.map(
									(t) => html`
										<div class="tool-card" data-status=${t.status} data-tool-id=${t.id}>
											<div class="tool-name">${t.name} · ${t.status}</div>
											${t.detail ? html`<div class="tool-detail">${t.detail}</div>` : null}
										</div>
									`,
								)}
							</div>
						`
			}
			${
				this.permission
					? html`
							<div class="gate" data-testid="permission-gate">
								<div class="gate-title">
									${this.locale.t("cliApprovals.title", {
										name: this.permission.toolName || "tool",
									})}
								</div>
								${
									this.permission.description
										? html`<div class="gate-desc">${this.permission.description}</div>`
										: null
								}
								<div class="gate-actions">
									<button
										type="button"
										class="primary"
										@click=${() => this.emitPermission("allow")}
									>
										${this.locale.t("cliApprovals.allow")}
									</button>
									<button type="button" @click=${() => this.emitPermission("allow-session")}>
										${this.locale.t("cliApprovals.allowSession")}
									</button>
									<button
										type="button"
										class="danger"
										@click=${() => this.emitPermission("deny")}
									>
										${this.locale.t("cliApprovals.deny")}
									</button>
								</div>
							</div>
						`
					: null
			}
			${
				this.question
					? html`
							<div class="gate" data-testid="question-gate">
								${this.question.questions.map(
									(q) => html`
										<div class="gate-title">${q.header || q.question}</div>
										${q.options.map(
											(opt) => html`
												<button
													type="button"
													class="q-option"
													@click=${() => this.emitQuestionAnswer(q.question, opt.label)}
												>
													<strong>${opt.label}</strong>
													${opt.description ? html`<div class="gate-desc">${opt.description}</div>` : null}
												</button>
											`,
										)}
									`,
								)}
							</div>
						`
					: null
			}
			<gcode-composer
				?disabled=${this.busy || !!this.permission || !!this.question}
				@gcode-send=${(e: CustomEvent<{ text: string }>) => {
					this.dispatchEvent(
						new CustomEvent("gcode-send", {
							detail: e.detail,
							bubbles: true,
							composed: true,
						}),
					)
				}}
			></gcode-composer>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"gcode-chat-panel": GcodeChatPanel
	}
}
