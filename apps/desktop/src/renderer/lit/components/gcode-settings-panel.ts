/**
 * Settings — general, providers, notifications, worktree, usage, server, about.
 * Reads/writes AppSettings via window.gcode when Electron is available.
 */
import { html, LitElement } from "lit"
import { customElement, property, state } from "lit/decorators.js"
import type {
	AppSettings,
	CompletionNotificationMode,
	NotificationSettings,
	SessionRuntimeDescriptor,
} from "../../../preload/api"
import { AVAILABLE_LOCALES, type Locale } from "../../i18n"
import { fetchRuntimeServerUrl } from "../../services/backend"
import { LocaleController } from "../locale-controller"
import { navigate } from "../router"
import { styles } from "./gcode-settings-panel.css.js"

const SECTIONS = [
	"general",
	"providers",
	"notifications",
	"worktree",
	"usage",
	"server",
	"about",
] as const

type Section = (typeof SECTIONS)[number]

@customElement("gcode-settings-panel")
export class GcodeSettingsPanel extends LitElement {
	static styles = styles
	private locale = new LocaleController(this)

	@property({ type: String })
	section = "general"

	@state() private serverUrl = ""
	@state() private settings: AppSettings | null = null
	@state() private providers: SessionRuntimeDescriptor[] = []
	@state() private error = ""
	@state() private usageHint = ""

	connectedCallback(): void {
		super.connectedCallback()
		void this.bootstrap()
	}

	private async bootstrap(): Promise<void> {
		this.error = ""
		await Promise.all([this.loadServer(), this.loadSettings(), this.loadProviders()])
	}

	private async loadServer(): Promise<void> {
		try {
			const { url } = await fetchRuntimeServerUrl()
			this.serverUrl = url || ""
		} catch {
			this.serverUrl = ""
		}
	}

	private async loadSettings(): Promise<void> {
		try {
			const g = (window as unknown as { gcode?: { getSettings?: () => Promise<AppSettings> } })
				.gcode
			if (!g?.getSettings) {
				this.settings = null
				return
			}
			this.settings = await g.getSettings()
		} catch (err) {
			this.error = err instanceof Error ? err.message : String(err)
		}
	}

	private async loadProviders(): Promise<void> {
		try {
			const g = (
				window as unknown as {
					gcode?: {
						agentSession?: {
							describeRuntimes?: () => Promise<SessionRuntimeDescriptor[]>
						}
					}
				}
			).gcode
			this.providers = (await g?.agentSession?.describeRuntimes?.()) ?? []
		} catch {
			this.providers = []
		}
	}

	private async patchSettings(partial: Record<string, unknown>): Promise<void> {
		try {
			const g = (
				window as unknown as {
					gcode?: {
						updateSettings?: (p: Record<string, unknown>) => Promise<AppSettings>
					}
				}
			).gcode
			if (!g?.updateSettings) {
				this.error = this.locale.t("litSettings.desktopOnly")
				return
			}
			this.settings = await g.updateSettings(partial)
		} catch (err) {
			this.error = err instanceof Error ? err.message : String(err)
		}
	}

	private onLocaleChange(e: Event): void {
		this.locale.setLocale((e.target as HTMLSelectElement).value as Locale)
	}

	private go(section: string): void {
		navigate(`/settings/${section}`)
	}

	private sectionLabel(s: Section): string {
		const map: Record<Section, string> = {
			general: this.locale.t("litSettings.general"),
			providers: this.locale.t("litSettings.providers"),
			notifications: this.locale.t("litSettings.notifications"),
			worktree: this.locale.t("litSettings.worktree"),
			usage: this.locale.t("litSettings.usage"),
			server: this.locale.t("litSettings.server"),
			about: this.locale.t("litSettings.about"),
		}
		return map[s]
	}

	private renderGeneral() {
		return html`
			<h1>${this.locale.t("litSettings.general")}</h1>
			<div class="card">
				<div class="row">
					<div>
						<div class="label">${this.locale.t("settings.language")}</div>
						<div class="desc">${this.locale.t("settings.languageDescription")}</div>
					</div>
					<select
						.value=${this.locale.locale}
						@change=${(e: Event) => this.onLocaleChange(e)}
					>
						${AVAILABLE_LOCALES.map(
							(loc) => html`
								<option value=${loc} ?selected=${loc === this.locale.locale}>
									${loc === "en" ? "English" : "Español"}
								</option>
							`,
						)}
					</select>
				</div>
			</div>
			<div class="card">
				<div class="row">
					<div>
						<div class="label">${this.locale.t("litSettings.opaqueWindows")}</div>
						<div class="desc">${this.locale.t("litSettings.opaqueWindowsDesc")}</div>
					</div>
					<input
						type="checkbox"
						.checked=${!!this.settings?.opaqueWindows}
						@change=${(e: Event) => {
							void this.patchSettings({
								opaqueWindows: (e.target as HTMLInputElement).checked,
							})
						}}
					/>
				</div>
			</div>
		`
	}

	private renderProviders() {
		return html`
			<h1>${this.locale.t("litSettings.providers")}</h1>
			<div class="card">
				<div class="desc" style="margin-bottom:12px">
					${this.locale.t("litSettings.providersDesc")}
				</div>
				${
					this.providers.length === 0
						? html`<div class="mono">${this.locale.t("litSettings.providersEmpty")}</div>`
						: this.providers.map(
								(p) => html`
									<div class="row" style="margin-bottom:10px">
										<div>
											<div class="label">${p.displayName || p.id}</div>
											<div class="desc mono">
												${p.id} · ${p.transport || "—"} ·
												${p.installed
													? this.locale.t("litSettings.installed")
													: this.locale.t("litSettings.notInstalled")}
											</div>
										</div>
										<span class="pill" data-ok=${String(!!p.installed)}>
											${p.installed ? "OK" : "—"}
										</span>
									</div>
								`,
							)
				}
				<button type="button" class="btn" @click=${() => this.loadProviders()}>
					${this.locale.t("litSettings.refresh")}
				</button>
			</div>
		`
	}

	private renderNotifications() {
		const n: NotificationSettings | undefined = this.settings?.notifications
		const modes: CompletionNotificationMode[] = ["off", "unfocused", "always"]
		return html`
			<h1>${this.locale.t("litSettings.notifications")}</h1>
			<div class="card">
				<div class="row" style="margin-bottom:12px">
					<div>
						<div class="label">${this.locale.t("litSettings.completionMode")}</div>
						<div class="desc">${this.locale.t("litSettings.completionModeDesc")}</div>
					</div>
					<select
						.value=${n?.completionMode || "unfocused"}
						@change=${(e: Event) => {
							const mode = (e.target as HTMLSelectElement).value as CompletionNotificationMode
							void this.patchSettings({
								notifications: { ...(n || {}), completionMode: mode },
							})
						}}
					>
						${modes.map(
							(m) => html`
								<option value=${m} ?selected=${(n?.completionMode || "unfocused") === m}>
									${m}
								</option>
							`,
						)}
					</select>
				</div>
				${(
					[
						["permissions", this.locale.t("litSettings.notifPermissions")],
						["questions", this.locale.t("litSettings.notifQuestions")],
						["errors", this.locale.t("litSettings.notifErrors")],
						["dockBadge", this.locale.t("litSettings.notifDockBadge")],
					] as const
				).map(
					([key, label]) => html`
						<div class="row" style="margin-bottom:8px">
							<div class="label">${label}</div>
							<input
								type="checkbox"
								.checked=${!!n?.[key]}
								@change=${(e: Event) => {
									void this.patchSettings({
										notifications: {
											...(n || {}),
											[key]: (e.target as HTMLInputElement).checked,
										},
									})
								}}
							/>
						</div>
					`,
				)}
			</div>
		`
	}

	private renderWorktree() {
		return html`
			<h1>${this.locale.t("litSettings.worktree")}</h1>
			<div class="card">
				<div class="label">${this.locale.t("litSettings.worktreeTitle")}</div>
				<div class="desc" style="margin-top:8px">
					${this.locale.t("litSettings.worktreeBody")}
				</div>
				<div class="desc" style="margin-top:12px">
					${this.locale.t("litSettings.worktreeHint")}
				</div>
			</div>
		`
	}

	private renderUsage() {
		return html`
			<h1>${this.locale.t("litSettings.usage")}</h1>
			<div class="card">
				<div class="label">${this.locale.t("litSettings.usageTitle")}</div>
				<div class="desc" style="margin-top:8px">
					${this.locale.t("litSettings.usageBody")}
				</div>
				${this.usageHint ? html`<div class="mono" style="margin-top:12px">${this.usageHint}</div>` : null}
				<button
					type="button"
					class="btn"
					style="margin-top:12px"
					@click=${() => {
						this.usageHint = this.locale.t("litSettings.usagePerSession")
					}}
				>
					${this.locale.t("litSettings.usageRefresh")}
				</button>
			</div>
		`
	}

	private renderServer() {
		return html`
			<h1>${this.locale.t("litSettings.server")}</h1>
			<div class="card">
				<div class="label">${this.locale.t("litSettings.serverUrl")}</div>
				<div class="mono" style="margin-top:8px">${this.serverUrl || "—"}</div>
				<button
					type="button"
					class="btn"
					style="margin-top:12px"
					@click=${() => this.loadServer()}
				>
					${this.locale.t("litSettings.refresh")}
				</button>
			</div>
		`
	}

	private renderAbout() {
		return html`
			<h1>${this.locale.t("litSettings.about")}</h1>
			<div class="card">
				<div class="label">GCode</div>
				<div class="desc" style="margin-top:8px">${this.locale.t("litSettings.aboutBody")}</div>
			</div>
		`
	}

	private renderSection(section: string) {
		switch (section as Section) {
			case "providers":
				return this.renderProviders()
			case "notifications":
				return this.renderNotifications()
			case "worktree":
				return this.renderWorktree()
			case "usage":
				return this.renderUsage()
			case "server":
				return this.renderServer()
			case "about":
				return this.renderAbout()
			default:
				return this.renderGeneral()
		}
	}

	render() {
		const section = this.section || "general"
		return html`
			<nav class="nav">
				${SECTIONS.map(
					(s) => html`
						<button
							type="button"
							data-active=${String(s === section)}
							@click=${() => this.go(s)}
						>
							${this.sectionLabel(s)}
						</button>
					`,
				)}
			</nav>
			<div class="content">
				${this.error ? html`<div class="error">${this.error}</div>` : null}
				${this.renderSection(section)}
			</div>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"gcode-settings-panel": GcodeSettingsPanel
	}
}
