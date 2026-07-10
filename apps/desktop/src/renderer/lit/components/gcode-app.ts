/**
 * Root Lit product shell — sole desktop UI entry.
 * Hash router: home, session, settings, automations, onboarding.
 */
import { html, LitElement } from "lit"
import { customElement, state } from "lit/decorators.js"
import { BusTopics, gcodeBus } from "../bus"
import {
	answerLitQuestion,
	respondLitPermission,
	runLitAgentTurn,
	type LitPermissionDecision,
	type LitPermissionRequest,
	type LitQuestionRequest,
	type LitToolEvent,
} from "../chat-runtime"
import { LocaleController } from "../locale-controller"
import { readOnboardingState } from "../onboarding-store"
import { navigate, parseHash, type LitRoute } from "../router"
import { sessionStore, type LitChatMessage } from "../session-store"
import type { ChatMessageView } from "./gcode-chat-panel"
import "./gcode-automations"
import "./gcode-chat-panel"
import "./gcode-home"
import "./gcode-onboarding"
import "./gcode-settings-panel"
import "./gcode-sidebar"
import { styles } from "./gcode-app.css.js"

@customElement("gcode-app")
export class GcodeApp extends LitElement {
	static styles = styles
	private locale = new LocaleController(this)

	@state() private route: LitRoute = parseHash()
	@state() private messages: ChatMessageView[] = []
	@state() private tools: LitToolEvent[] = []
	@state() private busy = false
	@state() private permission: LitPermissionRequest | null = null
	@state() private question: LitQuestionRequest | null = null
	@state() private sidebarOpen = true

	private unsubs: Array<() => void> = []
	private onHash = () => {
		this.route = parseHash()
		this.onRoute()
	}

	connectedCallback(): void {
		super.connectedCallback()
		sessionStore.refresh()
		document.getElementById("splash")?.classList.add("hiding")
		setTimeout(() => document.getElementById("splash")?.remove(), 320)

		window.addEventListener("hashchange", this.onHash)
		this.unsubs.push(
			gcodeBus.subscribe(BusTopics.localeChanged, () => this.requestUpdate()),
			gcodeBus.subscribe(BusTopics.sessionListChanged, () => this.requestUpdate()),
		)

		const bypassOnboardingForParityPreview =
			new URLSearchParams(location.search).get("onboarding") === "complete"
		if (
			!bypassOnboardingForParityPreview &&
			!readOnboardingState().completed &&
			this.route.name !== "onboarding"
		) {
			navigate("/onboarding")
		} else if (!location.hash || location.hash === "#") {
			navigate("/")
		}
		this.route = parseHash()
		this.onRoute()
	}

	disconnectedCallback(): void {
		window.removeEventListener("hashchange", this.onHash)
		for (const u of this.unsubs) u()
		this.unsubs = []
		super.disconnectedCallback()
	}

	private onRoute(): void {
		this.tools = []
		this.permission = null
		this.question = null
		if (this.route.name === "session") {
			void this.loadSession(this.route.sessionId)
		}
	}

	private async loadSession(sessionId: string): Promise<void> {
		sessionStore.select(sessionId)
		const local = sessionStore.getMessages(sessionId)
		this.messages =
			local.length > 0
				? local
				: [
						{
							id: "sys",
							role: "system",
							text: this.locale.t("litShell.sessionOpened", {
								id: sessionId.slice(0, 8),
							}),
						},
					]
	}

	private activeSessionId(): string | null {
		return this.route.name === "session" ? this.route.sessionId : sessionStore.getActiveId()
	}

	private upsertTool(tool: LitToolEvent): void {
		const idx = this.tools.findIndex((t) => t.id === tool.id)
		if (idx >= 0) {
			const next = [...this.tools]
			next[idx] = tool
			this.tools = next
		} else {
			this.tools = [...this.tools, tool]
		}
	}

	private async onSend(e: CustomEvent<{ text: string }>): Promise<void> {
		const text = e.detail?.text?.trim()
		if (!text || this.busy) return
		let sessionId = this.activeSessionId()
		if (!sessionId) {
			this.messages = [
				...this.messages,
				{
					id: `e-${Date.now()}`,
					role: "system",
					text: this.locale.t("litShell.turnFailed", {
						error: "No active session. Create one from Home first.",
					}),
				},
			]
			return
		}

		const userMsg: LitChatMessage = {
			id: `u-${Date.now()}`,
			role: "user",
			text,
		}
		this.messages = [...this.messages, userMsg]
		sessionStore.appendMessage(sessionId, userMsg)
		this.busy = true
		this.permission = null
		this.question = null
		this.tools = []

		const assistantId = `a-${Date.now()}`

		try {
			const finalText = await runLitAgentTurn(sessionId, text, {
					onAssistantDelta: (partial) => {
						this.messages = [
							...this.messages.filter((m) => m.id !== assistantId),
							{ id: assistantId, role: "assistant", text: partial },
						]
					},
					onPermission: (req) => {
						this.permission = req
					},
					onQuestion: (req) => {
						this.question = req
					},
					onTool: (tool) => {
						this.upsertTool(tool)
					},
					onError: (err) => {
						this.messages = [
							...this.messages,
							{
								id: `e-${Date.now()}`,
								role: "system",
								text: this.locale.t("litShell.turnFailed", { error: err }),
							},
						]
					},
			})
			if (finalText) {
				this.messages = [
					...this.messages.filter((m) => m.id !== assistantId),
					{ id: assistantId, role: "assistant", text: finalText },
				]
				sessionStore.appendMessage(sessionId, {
					id: assistantId,
					role: "assistant",
					text: finalText,
				})
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err)
			this.messages = [
				...this.messages,
				{
					id: `e-${Date.now()}`,
					role: "system",
					text: this.locale.t("litShell.turnFailed", { error: message }),
				},
			]
		} finally {
			this.busy = false
		}
	}

	private async onPermission(
		e: CustomEvent<{ requestId: string; decision: LitPermissionDecision }>,
	): Promise<void> {
		const sessionId = this.activeSessionId()
		if (!sessionId || !e.detail) return
		try {
			await respondLitPermission(sessionId, e.detail.requestId, e.detail.decision)
			this.permission = null
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err)
			this.messages = [
				...this.messages,
				{
					id: `e-${Date.now()}`,
					role: "system",
					text: this.locale.t("litShell.turnFailed", { error: message }),
				},
			]
		}
	}

	private async onQuestionAnswer(
		e: CustomEvent<{ requestId: string; answers: Record<string, string> }>,
	): Promise<void> {
		const sessionId = this.activeSessionId()
		if (!sessionId || !e.detail) return
		try {
			await answerLitQuestion(sessionId, e.detail.requestId, e.detail.answers)
			this.question = null
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err)
			this.messages = [
				...this.messages,
				{
					id: `e-${Date.now()}`,
					role: "system",
					text: this.locale.t("litShell.turnFailed", { error: message }),
				},
			]
		}
	}

	private onNewSession(): void {
		navigate("/")
	}

	private toggleSidebar(): void {
		this.sidebarOpen = !this.sidebarOpen
	}

	private renderMain() {
		const route = this.route
		switch (route.name) {
			case "onboarding":
				return html`<gcode-onboarding></gcode-onboarding>`
			case "settings":
				return html`<gcode-settings-panel
					section=${route.section}
				></gcode-settings-panel>`
			case "automations":
			case "automation":
				return html`<gcode-automations></gcode-automations>`
			case "session": {
				const active = sessionStore.list().find((s) => s.id === route.sessionId)
				return html`
					<gcode-chat-panel
						title=${active?.title || route.sessionId.slice(0, 8)}
						runtime-id=${active?.runtimeId || ""}
						.messages=${this.messages}
						.tools=${this.tools}
						.permission=${this.permission}
						.question=${this.question}
						?busy=${this.busy}
						@gcode-send=${(e: CustomEvent<{ text: string }>) => this.onSend(e)}
						@gcode-permission=${(
							e: CustomEvent<{ requestId: string; decision: LitPermissionDecision }>,
						) => this.onPermission(e)}
						@gcode-question-answer=${(
							e: CustomEvent<{ requestId: string; answers: Record<string, string> }>,
						) => this.onQuestionAnswer(e)}
					></gcode-chat-panel>
				`
			}
			case "home":
			default:
				return html`<gcode-home></gcode-home>`
		}
	}

	render() {
		const hideChrome = this.route.name === "onboarding"
		return html`
			<div class="frame" data-sidebar-open=${String(this.sidebarOpen)}>
				${
					hideChrome
						? null
						: html`
								<gcode-sidebar
									.activeId=${this.activeSessionId()}
									data-open=${String(this.sidebarOpen)}
									@gcode-new-session=${() => this.onNewSession()}
									@gcode-open-settings=${() => navigate("/settings/general")}
									@gcode-open-automations=${() => navigate("/automations")}
									@gcode-session-select=${(event: CustomEvent<{ id: string }>) => {
										navigate(`/session/${event.detail.id}`)
									}}
								></gcode-sidebar>
							`
				}
				<main class="main">
					${
						hideChrome
							? null
							: html`
									<header class="appbar">
										<gcode-wordmark></gcode-wordmark>
									</header>
								`
					}
					<div class="content">${this.renderMain()}</div>
				</main>
				${
					hideChrome
						? null
						: html`
								<div class="window-controls" aria-label="Window controls">
									<button
										type="button"
										class="window-control"
										title="Toggle sidebar"
										@click=${() => this.toggleSidebar()}
									>
										<svg viewBox="0 0 16 16" aria-hidden="true">
											<path d="M2.5 3.5h11v9h-11zM6 3.5v9" />
										</svg>
									</button>
									<button
										type="button"
										class="window-control"
										title=${this.locale.t("litShell.newSession")}
										@click=${() => this.onNewSession()}
									>
										<svg viewBox="0 0 16 16" aria-hidden="true">
											<path d="M8 3v10M3 8h10" />
										</svg>
									</button>
								</div>
							`
				}
			</div>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"gcode-app": GcodeApp
	}
}
