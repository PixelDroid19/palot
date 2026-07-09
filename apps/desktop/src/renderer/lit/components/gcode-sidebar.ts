/**
 * Session list + nav chrome.
 */
import { html, LitElement } from "lit"
import { customElement, property, state } from "lit/decorators.js"
import type { TranslationKey } from "../../i18n"
import { BusTopics, emitBubbled, gcodeBus } from "../bus"
import { LocaleController } from "../locale-controller"
import { navigate } from "../router"
import { type LitSessionSummary, sessionStore } from "../session-store"
import { styles } from "./gcode-sidebar.css.js"

@customElement("gcode-sidebar")
export class GcodeSidebar extends LitElement {
	static styles = styles
	private locale = new LocaleController(this)

	@property({ type: String, attribute: "active-id" })
	activeId: string | null = null

	@state()
	private sessions: LitSessionSummary[] = []

	private unsubList: (() => void) | null = null

	connectedCallback(): void {
		super.connectedCallback()
		sessionStore.refresh()
		this.sessions = sessionStore.list()
		this.unsubList = gcodeBus.subscribe(BusTopics.sessionListChanged, (list) => {
			this.sessions = list as LitSessionSummary[]
		})
	}

	disconnectedCallback(): void {
		this.unsubList?.()
		super.disconnectedCallback()
	}

	private t(key: TranslationKey, params?: Record<string, string | number>): string {
		return this.locale.t(key, params)
	}

	private onSelect(id: string): void {
		sessionStore.select(id)
		emitBubbled(this, "gcode-session-select", { id })
		navigate(`/session/${id}`)
	}

	render() {
		return html`
			<div class="header">
				<div class="brand">GCode</div>
				<div class="actions">
					<button
						class="icon-btn"
						type="button"
						title=${this.t("litShell.newSession")}
						@click=${() => {
							emitBubbled(this, "gcode-new-session", {})
							navigate("/")
						}}
					>
						+
					</button>
				</div>
			</div>
			<div class="section-label">${this.t("taskCatalog.activeNow")}</div>
			<div class="list" role="list">
				${
					this.sessions.length === 0
						? html`<div class="empty">${this.t("litShell.emptySessions")}</div>`
						: this.sessions.map(
								(s) => html`
									<button
										type="button"
										class="item"
										role="listitem"
										data-active=${String(s.id === this.activeId)}
										@click=${() => this.onSelect(s.id)}
									>
										<span class="title">${s.title}</span>
										<span class="meta">${s.runtimeId}</span>
									</button>
								`,
							)
				}
			</div>
			<div class="footer">
				<button type="button" @click=${() => this.locale.toggleLocale()}>
					${this.locale.locale === "en" ? "ES" : "EN"}
				</button>
				<button
					type="button"
					@click=${() => {
						emitBubbled(this, "gcode-open-automations", {})
						navigate("/automations")
					}}
				>
					${this.t("litAutomations.title")}
				</button>
				<button
					type="button"
					class="primary"
					@click=${() => {
						emitBubbled(this, "gcode-open-settings", {})
						navigate("/settings/general")
					}}
				>
					${this.t("litShell.settings")}
				</button>
			</div>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"gcode-sidebar": GcodeSidebar
	}
}
