/**
 * Lit session navigation. Geometry follows the established desktop sidebar frame while
 * session data remains framework-neutral through sessionStore.
 */
import { html, LitElement } from "lit"
import { customElement, property, state } from "lit/decorators.js"
import type { TranslationKey } from "../../i18n"
import {
	groupTasksByWorkspace,
	selectActiveSessions,
	selectRecentSessions,
} from "../../lib/session-catalog"
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

	private renderSession(session: LitSessionSummary, compact = false) {
		return html`
			<button
				type="button"
				class="item"
				data-compact=${String(compact)}
				role="listitem"
				data-active=${String(session.id === this.activeId)}
				@click=${() => this.onSelect(session.id)}
			>
				<span class="title">${session.title}</span>
				<span class="meta">${compact ? session.runtimeId : session.directory || session.runtimeId}</span>
			</button>
		`
	}

	private renderSection(label: string, sessions: LitSessionSummary[], compact = false) {
		if (sessions.length === 0) return null
		return html`
			<div class="section-label">${label}</div>
			<div class="section-list" role="list">${sessions.map((session) => this.renderSession(session, compact))}</div>
		`
	}

	private renderIcon(kind: "plus" | "automation" | "settings") {
		if (kind === "plus") {
			return html`<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg>`
		}
		if (kind === "automation") {
			return html`<svg viewBox="0 0 16 16" aria-hidden="true">
				<path d="M8 2.5a5.5 5.5 0 1 0 5.5 5.5A5.5 5.5 0 0 0 8 2.5Z" />
				<path d="M8 5v3l2 1.25" />
			</svg>`
		}
		return html`<svg viewBox="0 0 16 16" aria-hidden="true">
			<path d="m6.4 2.8.35-.8h2.5l.35.8 1 .42.82-.28 1.77 1.77-.28.82.42 1 .8.35v2.5l-.8.35-.42 1 .28.82-1.77 1.77-.82-.28-1 .42-.35.8h-2.5l-.35-.8-1-.42-.82.28-1.77-1.77.28-.82-.42-1-.8-.35v-2.5l.8-.35.42-1-.28-.82L4.58 2.94l.82.28 1-.42Z" />
			<circle cx="8" cy="8" r="2.1" />
		</svg>`
	}

	render() {
		const catalog = this.sessions.map((session) => ({
			id: session.id,
			status: session.status || "idle",
			createdAt: session.updatedAt,
			lastActiveAt: session.updatedAt,
			runtimeId: session.runtimeId,
			name: session.title,
			projectDirectory: session.directory,
		}))
		const active = selectActiveSessions(catalog)
		const activeIds = new Set(active.map((session) => session.id))
		const recent = selectRecentSessions(catalog, activeIds, 5)
		const groups = groupTasksByWorkspace(catalog)
		const byId = new Map(this.sessions.map((session) => [session.id, session]))
		const summaries = (items: readonly { id: string }[]) =>
			items.map((item) => byId.get(item.id)).filter((item): item is LitSessionSummary => !!item)
		return html`
			<div class="titlebar-spacer" aria-hidden="true"></div>
			<div class="list" role="list">
				<div class="top-actions" aria-label="Primary navigation">
					<a href="#/" class="nav-item" @click=${() => emitBubbled(this, "gcode-new-session", {})}>
						${this.renderIcon("plus")}<span>${this.t("litShell.newSession")}</span>
					</a>
					<a
						href="#/automations"
						class="nav-item"
						@click=${() => emitBubbled(this, "gcode-open-automations", {})}
					>
						${this.renderIcon("automation")}<span>${this.t("litAutomations.title")}</span>
					</a>
				</div>
				${
					this.sessions.length === 0
						? html`<div class="empty">${this.t("litShell.emptySessions")}</div>`
						: html`
								${this.renderSection(this.t("taskCatalog.activeNow"), summaries(active))}
								${this.renderSection("Recent", summaries(recent))}
								${groups.length > 0 ? html`<div class="section-label">Projects</div>` : null}
								${groups.map(
									(group) => html`
										<section class="project">
											<div class="project-label">${group.label}</div>
											<div class="section-list" role="list">${this.renderSession(summaries(group.tasks)[0]!)}</div>
											${summaries(group.tasks).slice(1).map((session) => this.renderSession(session, true))}
										</section>
									`,
								)}
							`
				}
			</div>
			<div class="footer">
				<a
					href="#/settings/general"
					class="settings"
					@click=${() => emitBubbled(this, "gcode-open-settings", {})}
				>
					${this.renderIcon("settings")}<span>${this.t("litShell.settings")}</span>
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
