/**
 * Lit session navigation. Geometry follows the React sidebar frame while
 * session data remains framework-neutral through sessionStore.
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

	@state() private sessions: LitSessionSummary[] = []
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
			<div class="titlebar-spacer" aria-hidden="true"></div>
			<div class="section-label">${this.t("taskCatalog.activeNow")}</div>
			<div class="list" role="list">
				${
					this.sessions.length === 0
						? html`<div class="empty">${this.t("litShell.emptySessions")}</div>`
						: this.sessions.map(
								(session) => html`
									<button
										type="button"
										class="item"
										role="listitem"
										data-active=${String(session.id === this.activeId)}
										@click=${() => this.onSelect(session.id)}
									>
										<span class="title">${session.title}</span>
										<span class="meta">${session.runtimeId}</span>
									</button>
								`,
							)
				}
			</div>
			<div class="footer">
				<div class="footer-actions">
					<a href="#/" @click=${() => emitBubbled(this, "gcode-new-session", {})}>
						<span aria-hidden="true">＋</span>${this.t("litShell.newSession")}
					</a>
					<a
						href="#/automations"
						@click=${() => emitBubbled(this, "gcode-open-automations", {})}
					>
						<span aria-hidden="true">◌</span>${this.t("litAutomations.title")}
					</a>
				</div>
				<a
					href="#/settings/general"
					class="settings"
					@click=${() => emitBubbled(this, "gcode-open-settings", {})}
				>
					<span aria-hidden="true">⚙</span>${this.t("litShell.settings")}
				</a>
			</div>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"gcode-sidebar": GcodeSidebar
	}
}
