/**
 * Session / task sidebar — dense agent-IDE style (Codex-like activity list).
 * Emits bubbled events; also publishes on gcodeBus.
 */
import { html, LitElement, nothing } from "lit"
import { customElement, property, state } from "lit/decorators.js"
import type { TranslationKey } from "../../i18n"
import { BusTopics, emitBubbled, gcodeBus } from "../bus"
import { LocaleController } from "../locale-controller"
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
	private unsubSelect: (() => void) | null = null

	connectedCallback(): void {
		super.connectedCallback()
		sessionStore.refresh()
		this.sessions = sessionStore.list()
		this.unsubList = gcodeBus.subscribe(BusTopics.sessionListChanged, (list) => {
			this.sessions = list as LitSessionSummary[]
		})
		this.unsubSelect = gcodeBus.subscribe(BusTopics.sessionSelect, (id) => {
			this.activeId = id as string | null
		})
	}

	disconnectedCallback(): void {
		this.unsubList?.()
		this.unsubSelect?.()
		super.disconnectedCallback()
	}

	private t(key: TranslationKey, params?: Record<string, string | number>): string {
		return this.locale.t(key, params)
	}

	private onSelect(id: string): void {
		sessionStore.select(id)
		emitBubbled(this, "gcode-session-select", { id })
	}

	private onNew(): void {
		emitBubbled(this, "gcode-new-session", {})
		gcodeBus.publish(BusTopics.nav, { view: "new-session" })
	}

	private onSettings(): void {
		emitBubbled(this, "gcode-open-settings", {})
		gcodeBus.publish(BusTopics.nav, { view: "settings" })
	}

	private onLocale(): void {
		this.locale.toggleLocale()
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
						@click=${() => this.onNew()}
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
				<button type="button" @click=${() => this.onLocale()}>
					${this.locale.locale === "en" ? "ES" : "EN"}
				</button>
				<button type="button" class="primary" @click=${() => this.onSettings()}>
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

// silence unused when nothing imported
void nothing
