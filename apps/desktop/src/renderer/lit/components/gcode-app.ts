/**
 * Optional Lit product shell — sidebar + chat/settings.
 * Chat turns use `runLitAgentTurn` (window.gcode.agentSession), same IPC as React.
 * Registered via lit/register; React remains default full-product entry.
 */
import { html, LitElement } from "lit"
import { customElement, state } from "lit/decorators.js"
import { BusTopics, gcodeBus } from "../bus"
import { runLitAgentTurn } from "../chat-runtime"
import { LocaleController } from "../locale-controller"
import { sessionStore } from "../session-store"
import type { ChatMessageView } from "./gcode-chat-panel"
import "./gcode-chat-panel"
import "./gcode-settings-panel"
import "./gcode-sidebar"
import { styles } from "./gcode-app.css.js"

type View = "chat" | "settings"

@customElement("gcode-app")
export class GcodeApp extends LitElement {
	static styles = styles

	private locale = new LocaleController(this)

	@state()
	private view: View = "chat"

	@state()
	private activeId: string | null = null

	@state()
	private messages: ChatMessageView[] = []

	@state()
	private busy = false

	private unsubs: Array<() => void> = []

	connectedCallback(): void {
		super.connectedCallback()
		sessionStore.refresh()
		document.getElementById("splash")?.classList.add("hiding")
		setTimeout(() => document.getElementById("splash")?.remove(), 320)

		this.unsubs.push(
			gcodeBus.subscribe(BusTopics.sessionSelect, (id) => {
				this.activeId = id as string | null
				this.view = "chat"
				this.loadTranscript(this.activeId)
			}),
			gcodeBus.subscribe(BusTopics.nav, (payload) => {
				const view = (payload as { view?: View }).view
				if (view === "settings" || view === "chat") this.view = view
			}),
			gcodeBus.subscribe(BusTopics.localeChanged, () => this.requestUpdate()),
		)

		if (this.messages.length === 0) {
			this.messages = [
				{
					id: "sys-1",
					role: "system",
					text: this.locale.t("litShell.systemReady"),
				},
			]
		}
	}

	disconnectedCallback(): void {
		for (const u of this.unsubs) u()
		this.unsubs = []
		super.disconnectedCallback()
	}

	private loadTranscript(sessionId: string | null): void {
		if (!sessionId) return
		const msgs = sessionStore.getMessages(sessionId)
		this.messages =
			msgs.length > 0
				? msgs
				: [
						{
							id: "sys-open",
							role: "system",
							text: this.locale.t("litShell.sessionOpened", {
								id: sessionId.slice(0, 8),
							}),
						},
					]
	}

	private onSend(e: CustomEvent<{ text: string }>): void {
		const text = e.detail?.text?.trim()
		if (!text || this.busy) return
		void this.runTurn(text)
	}

	private async runTurn(text: string): Promise<void> {
		// Ensure we have a session id for persistence
		let sessionId = this.activeId
		if (!sessionId) {
			sessionId = `lit-${Date.now().toString(36)}`
			sessionStore.upsertAndPersist({
				id: sessionId,
				title: text.slice(0, 48) || this.locale.t("litShell.newSessionTitle"),
				runtimeId: "local",
				directory: "",
			})
			sessionStore.select(sessionId)
			this.activeId = sessionId
		}

		const userId = `u-${Date.now()}`
		const userMsg: ChatMessageView = { id: userId, role: "user", text }
		this.messages = [...this.messages, userMsg]
		sessionStore.appendMessage(sessionId, userMsg)
		this.busy = true

		const assistantId = `a-${Date.now()}`
		let assistantText = ""

		try {
			const finalText = await runLitAgentTurn(sessionId, text, {
				onAssistantDelta: (partial) => {
					assistantText = partial
					this.patchAssistant(assistantId, partial)
				},
				onAssistantFinal: (final) => {
					assistantText = final
					this.patchAssistant(assistantId, final)
				},
				onError: (err) => {
					this.messages = [
						...this.messages.filter((m) => m.id !== assistantId),
						{
							id: `e-${Date.now()}`,
							role: "system",
							text: this.locale.t("litShell.turnFailed", { error: err }),
						},
					]
				},
			})
			const out = finalText || assistantText
			if (out) {
				this.patchAssistant(assistantId, out)
				sessionStore.appendMessage(sessionId, {
					id: assistantId,
					role: "assistant",
					text: out,
				})
			}
		} catch {
			// onError already handled when thrown from runLitAgentTurn
		} finally {
			this.busy = false
		}
	}

	private patchAssistant(id: string, text: string): void {
		const without = this.messages.filter((m) => m.id !== id)
		this.messages = [...without, { id, role: "assistant", text }]
	}

	private onNewSession(): void {
		const id = `lit-${Date.now().toString(36)}`
		sessionStore.upsertAndPersist({
			id,
			title: this.locale.t("litShell.newSessionTitle"),
			runtimeId: "local",
			directory: "",
		})
		sessionStore.select(id)
		this.activeId = id
		this.messages = [
			{
				id: "sys-new",
				role: "system",
				text: this.locale.t("litShell.systemReady"),
			},
		]
		this.view = "chat"
	}

	render() {
		const active = sessionStore.list().find((s) => s.id === this.activeId)
		return html`
			<gcode-sidebar
				.activeId=${this.activeId}
				@gcode-new-session=${() => this.onNewSession()}
				@gcode-open-settings=${() => {
					this.view = "settings"
				}}
			></gcode-sidebar>
			<div class="main">
				${
					this.view === "settings"
						? html`<gcode-settings-panel
								@gcode-nav-back=${() => {
									this.view = "chat"
								}}
							></gcode-settings-panel>`
						: html`<gcode-chat-panel
								title=${active?.title || this.locale.t("litShell.welcomeTitle")}
								runtime-id=${active?.runtimeId || ""}
								.messages=${this.messages}
								?busy=${this.busy}
								@gcode-send=${(e: CustomEvent<{ text: string }>) => this.onSend(e)}
							></gcode-chat-panel>`
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
