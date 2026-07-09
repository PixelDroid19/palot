/**
 * Root Lit shell — sidebar + chat/settings views.
 * Coordinates children via bubbled events and gcodeBus (no React).
 */
import { html, LitElement } from "lit"
import { customElement, state } from "lit/decorators.js"
import { BusTopics, gcodeBus } from "../bus"
import { LocaleController } from "../locale-controller"
import { sessionStore } from "../session-store"
import type { ChatMessageView } from "./gcode-chat-panel"
import "./gcode-chat-panel"
import "./gcode-settings-panel"
import "./gcode-sidebar"
import { styles } from "./gcode-app.css.js"

type View = "chat" | "settings" | "new-session"

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
		// Remove splash if present
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
				if (view) this.view = view
			}),
			gcodeBus.subscribe(BusTopics.localeChanged, () => this.requestUpdate()),
		)

		// Demo welcome system message for empty product chrome
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
		// Prefer CLI persistence key if present
		try {
			const raw =
				localStorage.getItem(`gcode:cliSession:${sessionId}`) ??
				localStorage.getItem(`palot:cliSession:${sessionId}`)
			if (!raw) {
				this.messages = [
					{
						id: "sys-open",
						role: "system",
						text: this.locale.t("litShell.sessionOpened", { id: sessionId.slice(0, 8) }),
					},
				]
				return
			}
			const parsed = JSON.parse(raw) as {
				messages?: Array<{ id?: string; role?: string; text?: string }>
			}
			const msgs = (parsed.messages || [])
				.map((m, i) => ({
					id: m.id || `m-${i}`,
					role: (m.role === "user" || m.role === "assistant" ? m.role : "system") as
						| "user"
						| "assistant"
						| "system",
					text: m.text || "",
				}))
				.filter((m) => m.text)
			this.messages =
				msgs.length > 0
					? msgs
					: [
							{
								id: "sys-empty",
								role: "system",
								text: this.locale.t("litShell.sessionOpened", {
									id: sessionId.slice(0, 8),
								}),
							},
						]
		} catch {
			this.messages = []
		}
	}

	private onSend(e: CustomEvent<{ text: string }>): void {
		const text = e.detail?.text?.trim()
		if (!text) return
		const userMsg: ChatMessageView = {
			id: `u-${Date.now()}`,
			role: "user",
			text,
		}
		this.messages = [...this.messages, userMsg]
		this.busy = true
		// Local echo assistant stub — real agent turns go through agentSession IPC
		// when a runtime session is active; this keeps the shell interactive offline.
		const runtime = this.activeRuntimeLabel()
		void this.runTurn(text, runtime)
	}

	private activeRuntimeLabel(): string {
		const s = sessionStore.list().find((x) => x.id === this.activeId)
		return s?.runtimeId || "local"
	}

	private async runTurn(text: string, runtime: string): Promise<void> {
		try {
			// Prefer live agent session when Electron bridge is present
			const bridge = (window as unknown as { gcode?: { agentSession?: AgentSessionBridge } })
				.gcode
			const agentSession = bridge?.agentSession
			if (agentSession && this.activeId) {
				await agentSession.open(this.activeId, runtime, {
					cwd: sessionStore.list().find((s) => s.id === this.activeId)?.directory || "",
					sandbox: "workspace-write",
				})
				const result = await agentSession.prompt(this.activeId, {
					text,
					sandbox: "workspace-write",
				})
				const message =
					(result as { message?: string })?.message ||
					(result as { text?: string })?.text ||
					JSON.stringify(result)
				this.messages = [
					...this.messages,
					{
						id: `a-${Date.now()}`,
						role: "assistant",
						text: String(message).slice(0, 8000),
					},
				]
				return
			}
			// Offline / browser demo response
			this.messages = [
				...this.messages,
				{
					id: `a-${Date.now()}`,
					role: "assistant",
					text: this.locale.t("litShell.offlineReply", { text: text.slice(0, 120) }),
				},
			]
		} catch (err) {
			this.messages = [
				...this.messages,
				{
					id: `e-${Date.now()}`,
					role: "system",
					text: this.locale.t("litShell.turnFailed", {
						error: err instanceof Error ? err.message : String(err),
					}),
				},
			]
		} finally {
			this.busy = false
		}
	}

	private onNewSession(): void {
		const id = `lit-${Date.now().toString(36)}`
		sessionStore.upsertLocal({
			id,
			title: this.locale.t("litShell.newSessionTitle"),
			runtimeId: "local",
			updatedAt: Date.now(),
		})
		sessionStore.select(id)
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

interface AgentSessionBridge {
	open: (
		sessionId: string,
		runtimeId: string,
		opts: { cwd: string; sandbox?: string },
	) => Promise<unknown>
	prompt: (sessionId: string, opts: { text: string; sandbox?: string }) => Promise<unknown>
}

declare global {
	interface HTMLElementTagNameMap {
		"gcode-app": GcodeApp
	}
}
