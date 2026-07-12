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
import "./gcode-cli-approval"
import "./gcode-composer"
import "./gcode-markdown"
import "./gcode-tool-card"
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
	@property({ type: String, attribute: "session-id" }) sessionId = ""
	@property({ type: String, attribute: "runtime-id" }) runtimeId = ""
	@property({ attribute: false }) messages: ChatMessageView[] = []
	@property({ attribute: false }) tools: LitToolEvent[] = []
	@property({ attribute: false }) permission: LitPermissionRequest | null = null
	@property({ attribute: false }) question: LitQuestionRequest | null = null
	@property({ type: Boolean }) busy = false

	private renderToolIcon(name: string) {
		const normalized = name.toLowerCase()
		if (["read", "list", "glob", "grep", "search"].some((word) => normalized.includes(word))) {
			return html`<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.25" aria-hidden="true">
				<circle cx="6.75" cy="6.75" r="3.25"></circle>
				<path d="m9.25 9.25 3.25 3.25"></path>
			</svg>`
		}
		if (["bash", "shell", "command", "terminal"].some((word) => normalized.includes(word))) {
			return html`<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.25" aria-hidden="true">
				<path d="m3.25 5.25 3 2.75-3 2.75M7.75 10.75h4.5"></path>
			</svg>`
		}
		if (["edit", "write", "patch"].some((word) => normalized.includes(word))) {
			return html`<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.25" aria-hidden="true">
				<path d="m3.25 10.75-.5 2.5 2.5-.5 6.5-6.5-2-2zM8.75 4.75l2 2"></path>
			</svg>`
		}
		return html`<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.25" aria-hidden="true">
			<rect x="3" y="3" width="10" height="10" rx="1.25"></rect>
			<path d="M5.5 6.25h5M5.5 8h3.5M5.5 9.75h5"></path>
		</svg>`
	}

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

	private handlePermissionDecision(event: CustomEvent<{ decision: string }>): void {
		const decisions: Record<string, LitPermissionDecision> = {
			accept: "allow",
			acceptForSession: "allow-session",
			decline: "deny",
		}
		const decision = decisions[event.detail?.decision]
		if (decision) this.emitPermission(decision)
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
									<p>${this.locale.t("litShell.noMessages")}</p>
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
										<div class="msg-body">${m.role === "assistant"
											? html`<gcode-markdown source=${m.text}></gcode-markdown>`
											: m.text}</div>
										</div>
									`,
								)}
								${this.tools.map(
									(t) => html`
										<div class="tool" data-tool-id=${t.id}>
											<gcode-tool-card
												card-title=${t.name}
												subtitle=${t.detail || ""}
												status=${t.status === "failed" ? "error" : t.status}
											>
												<span slot="icon">${this.renderToolIcon(t.name)}</span>
												<span slot="trailing" class="tool-status" data-status=${t.status}>${t.status}</span>
											</gcode-tool-card>
										</div>
									`,
								)}
							</div>
						`
			}
			${
				this.permission
					? html`
							<gcode-cli-approval
								session-id=${this.sessionId}
								.requests=${[
									{
										requestId: this.permission.requestId,
										name: this.permission.toolName || "tool",
										title: this.locale.t("cliApprovals.title", {
											name: this.permission.toolName || "tool",
										}),
										detail: this.permission.description,
										decisions: ["acceptForSession"],
									},
								]}
								@gcode-permission-decision=${(event: CustomEvent<{ decision: string }>) =>
									this.handlePermissionDecision(event)}
							></gcode-cli-approval>
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
				session-id=${this.sessionId}
				runtime-id=${this.runtimeId}
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
