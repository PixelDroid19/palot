/**
 * Primary chat surface — message list + composer host.
 * Parent supplies messages; composer send bubbles as `gcode-send`.
 */
import { html, LitElement } from "lit"
import { customElement, property } from "lit/decorators.js"
import { LocaleController } from "../locale-controller"
import "./gcode-composer"
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

	@property({ type: String })
	title = "GCode"

	@property({ type: String, attribute: "runtime-id" })
	runtimeId = ""

	@property({ attribute: false })
	messages: ChatMessageView[] = []

	@property({ type: Boolean, attribute: "busy" })
	busy = false

	render() {
		const empty = this.messages.length === 0
		return html`
			<div class="topbar">
				<div class="topbar-title">${this.title}</div>
				${
					this.runtimeId
						? html`<span class="runtime-pill">${this.runtimeId}</span>`
						: html`<span></span>`
				}
			</div>
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
											<div class="msg-body">${m.text}</div>
										</div>
									`,
								)}
							</div>
						`
			}
			<gcode-composer
				?disabled=${this.busy}
				@gcode-send=${(e: CustomEvent<{ text: string }>) => {
					// re-bubble for app shell
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
