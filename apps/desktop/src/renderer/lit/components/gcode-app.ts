/**
 * Root Lit product shell — sole desktop UI entry.
 * Hash router: home, session, settings, automations, onboarding.
 */
import { html, LitElement } from "lit"
import { customElement, state } from "lit/decorators.js"
import { BusTopics, gcodeBus } from "../bus"
import { runLitAgentTurn } from "../chat-runtime"
import { LocaleController } from "../locale-controller"
import {
	createManagedSession,
	loadManagedMessages,
	promptManagedSession,
} from "../managed-chat"
import { readOnboardingState } from "../onboarding-store"
import { hrefForRoute, navigate, parseHash, type LitRoute } from "../router"
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
	@state() private busy = false
	@state() private permission: {
		requestId: string
		toolName?: string
		description?: string
	} | null = null

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

		if (!readOnboardingState().completed && this.route.name !== "onboarding") {
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
		if (this.route.name === "session") {
			void this.loadSession(this.route.sessionId)
		}
	}

	private async loadSession(sessionId: string): Promise<void> {
		sessionStore.select(sessionId)
		const meta = sessionStore.getMeta(sessionId)
		if (meta?.runtimeId === "opencode" || sessionId.startsWith("ses_")) {
			try {
				const msgs = await loadManagedMessages(sessionId)
				this.messages =
					msgs.length > 0
						? msgs
						: [
								{
									id: "sys",
									role: "system",
									text: this.locale.t("litShell.sessionOpened", {
										id: sessionId.slice(0, 8),
									}),
								},
							]
				return
			} catch {
				// fall through to local persistence
			}
		}
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

	private async onSend(e: CustomEvent<{ text: string }>): Promise<void> {
		const text = e.detail?.text?.trim()
		if (!text || this.busy) return
		let sessionId = this.activeSessionId()
		if (!sessionId) {
			// create local session then send
			sessionId = crypto.randomUUID()
			sessionStore.upsertAndPersist({
				id: sessionId,
				title: text.slice(0, 48),
				runtimeId: "claude",
				directory: "",
			})
			navigate(`/session/${sessionId}`)
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

		const meta = sessionStore.getMeta(sessionId)
		const runtimeId = meta?.runtimeId || "claude"
		const assistantId = `a-${Date.now()}`

		try {
			if (runtimeId === "opencode" || sessionId.startsWith("ses_")) {
				await promptManagedSession(sessionId, text)
				// poll messages once after async prompt
				await new Promise((r) => setTimeout(r, 1500))
				const msgs = await loadManagedMessages(sessionId)
				if (msgs.length) this.messages = msgs
			} else {
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
			this.permission = null
		}
	}

	private onNewSession(): void {
		navigate("/")
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
					${
						this.permission
							? html`
									<div
										style="padding:8px 16px;background:var(--gcode-bg-muted);border-bottom:1px solid var(--gcode-border);font-size:12px;"
									>
										${this.locale.t("cliApprovals.title", {
											name: this.permission.toolName || "tool",
										})}
									</div>
								`
							: null
					}
					<gcode-chat-panel
						title=${active?.title || route.sessionId.slice(0, 8)}
						runtime-id=${active?.runtimeId || ""}
						.messages=${this.messages}
						?busy=${this.busy}
						@gcode-send=${(e: CustomEvent<{ text: string }>) => this.onSend(e)}
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
			${
				hideChrome
					? null
					: html`
							<gcode-sidebar
								.activeId=${this.activeSessionId()}
								@gcode-new-session=${() => this.onNewSession()}
								@gcode-open-settings=${() => navigate("/settings/general")}
								@gcode-open-automations=${() => navigate("/automations")}
								@gcode-session-select=${(e: CustomEvent<{ id: string }>) => {
									navigate(`/session/${e.detail.id}`)
								}}
							></gcode-sidebar>
						`
			}
			<div class="main">${this.renderMain()}</div>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"gcode-app": GcodeApp
	}
}

// silence unused import if tree-shaken
void hrefForRoute
void createManagedSession
