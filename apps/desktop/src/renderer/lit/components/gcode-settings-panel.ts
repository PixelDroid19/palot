/**
 * Settings — general, providers, plugins, integrations, notifications,
 * worktrees, usage, setup, about. Real IPC / agent-host APIs only.
 */
import { html, LitElement } from "lit"
import { customElement, property, state } from "lit/decorators.js"
import type {
	AppSettings,
	CompletionNotificationMode,
	NotificationSettings,
	SessionRuntimeDescriptor,
	WebhookSettings,
} from "../../../preload/api"
import { AVAILABLE_LOCALES, type Locale } from "../../i18n"
import {
	addPlugin,
	listPlugins,
	removePlugin,
} from "../../services/plugins-service"
import {
	EMPTY_USAGE_STATS,
	fetchUsageStats,
	formatCost,
	formatTokens,
	type UsageStats,
} from "../../services/usage-stats"
import { ensureRuntimeClient } from "../ensure-runtime-client"
import { LocaleController } from "../locale-controller"
import { markOnboardingIncomplete, readOnboardingState } from "../onboarding-store"
import {
	loadRuntimeSetupStatuses,
	type RuntimeSetupStatus,
} from "../../services/runtime-setup-status"
import { styles } from "./gcode-settings-panel.css.js"

const SECTIONS = [
	"general",
	"providers",
	"plugins",
	"integrations",
	"notifications",
	"worktrees",
	"usage",
	"setup",
	"about",
] as const

type Section = (typeof SECTIONS)[number]

interface WorktreeEntry {
	directory: string
	projectDir: string
	projectName: string
}

@customElement("gcode-settings-panel")
export class GcodeSettingsPanel extends LitElement {
	static styles = styles
	private locale = new LocaleController(this)

	@property({ type: String })
	section = "general"

	@state() private settings: AppSettings | null = null
	@state() private providers: SessionRuntimeDescriptor[] = []
	@state() private plugins: string[] = []
	@state() private pluginDraft = ""
	@state() private worktrees: WorktreeEntry[] = []
	@state() private setupRuntimes: RuntimeSetupStatus[] = []
	@state() private setupRestoreResult = ""
	@state() private usage: UsageStats = EMPTY_USAGE_STATS
	@state() private error = ""
	@state() private loading = ""
	@state() private webhookTest: Record<string, string> = {}

	connectedCallback(): void {
		super.connectedCallback()
		void this.bootstrap()
	}

	protected updated(changed: Map<string, unknown>): void {
		if (changed.has("section")) {
			void this.onSectionEnter(this.section)
		}
	}

	private async bootstrap(): Promise<void> {
		this.error = ""
		await Promise.all([this.loadSettings(), this.loadProviders()])
		await this.onSectionEnter(this.section)
	}

	private async onSectionEnter(section: string): Promise<void> {
		if (this.isProcessOnlyComposition() && ["plugins", "worktrees", "usage"].includes(section)) return
		if (section === "plugins") await this.loadPlugins()
		if (section === "worktrees") await this.loadWorktrees()
		if (section === "usage") await this.loadUsage()
		if (section === "setup") await this.loadSetupRuntimes()
	}

	private isProcessOnlyComposition(): boolean {
		const hasAgentSessionBridge =
			typeof window !== "undefined" && "gcode" in window && !!window.gcode?.agentSession
		return (
			(hasAgentSessionBridge && this.providers.length === 0) ||
			(this.providers.length > 0 &&
				!this.providers.some((provider) => provider.sessionCapabilities.supportsRuntimeConfiguration))
		)
	}

	private visibleSections(): readonly Section[] {
		if (!this.isProcessOnlyComposition()) return SECTIONS
		return SECTIONS.filter((section) => !["plugins", "worktrees", "usage"].includes(section))
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

	private async loadPlugins(): Promise<void> {
		this.loading = "plugins"
		this.error = ""
		try {
			await ensureRuntimeClient()
			this.plugins = await listPlugins()
		} catch (err) {
			this.plugins = []
			this.error = err instanceof Error ? err.message : String(err)
		} finally {
			this.loading = ""
		}
	}

	private async loadWorktrees(): Promise<void> {
		this.loading = "worktree"
		this.error = ""
		this.worktrees = []
		this.loading = ""
	}

	private async loadUsage(): Promise<void> {
		this.loading = "usage"
		this.error = ""
		try {
			await ensureRuntimeClient()
			this.usage = await fetchUsageStats()
		} catch (err) {
			this.usage = EMPTY_USAGE_STATS
			this.error = err instanceof Error ? err.message : String(err)
		} finally {
			this.loading = ""
		}
	}

	private async loadSetupRuntimes(force = false): Promise<void> {
		this.loading = "setup"
		this.error = ""
		try {
			this.setupRuntimes = await loadRuntimeSetupStatuses(force)
		} catch (err) {
			this.setupRuntimes = []
			this.error = err instanceof Error ? err.message : String(err)
		} finally {
			this.loading = ""
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

	private sectionLabel(s: Section): string {
		const map: Record<Section, string> = {
			general: this.locale.t("litSettings.general"),
			providers: this.locale.t("litSettings.providers"),
			plugins: this.locale.t("litSettings.plugins"),
			integrations: this.locale.t("litSettings.integrations"),
			notifications: this.locale.t("litSettings.notifications"),
			worktrees: this.locale.t("litSettings.worktrees"),
			usage: this.locale.t("litSettings.usage"),
			setup: this.locale.t("litSettings.setup"),
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

	private renderPlugins() {
		return html`
			<h1>${this.locale.t("litSettings.plugins")}</h1>
			<div class="card">
				<div class="desc" style="margin-bottom:12px">
					${this.locale.t("litSettings.pluginsDesc")}
				</div>
				<div class="row" style="margin-bottom:12px;gap:8px">
					<input
						style="flex:1"
						.value=${this.pluginDraft}
						placeholder="opencode-plugin-name"
						@input=${(e: Event) => {
							this.pluginDraft = (e.target as HTMLInputElement).value
						}}
					/>
					<button
						type="button"
						class="btn primary"
						?disabled=${this.loading === "plugins"}
						@click=${async () => {
							try {
								await ensureRuntimeClient()
								this.plugins = await addPlugin(this.pluginDraft)
								this.pluginDraft = ""
							} catch (err) {
								this.error = err instanceof Error ? err.message : String(err)
							}
						}}
					>
						${this.locale.t("litSettings.pluginAdd")}
					</button>
				</div>
				${
					this.loading === "plugins"
						? html`<div class="mono">…</div>`
						: this.plugins.length === 0
							? html`<div class="mono">${this.locale.t("litSettings.pluginsEmpty")}</div>`
							: this.plugins.map(
									(name) => html`
										<div class="row" style="margin-bottom:8px">
											<div class="mono">${name}</div>
											<button
												type="button"
												class="btn danger"
												@click=${async () => {
													try {
														this.plugins = await removePlugin(name)
													} catch (err) {
														this.error = err instanceof Error ? err.message : String(err)
													}
												}}
											>
												${this.locale.t("litSettings.pluginRemove")}
											</button>
										</div>
									`,
								)
				}
				<button type="button" class="btn" @click=${() => this.loadPlugins()}>
					${this.locale.t("litSettings.refresh")}
				</button>
			</div>
		`
	}

	private renderIntegrations() {
		const w: WebhookSettings | undefined = this.settings?.webhooks
		const skill = this.settings?.skillSync
		const targets = [
			["feishu", "Feishu", w?.feishuUrl || ""],
			["wechat", "WeChat Work", w?.wechatUrl || ""],
			["generic", "Generic", w?.genericUrl || ""],
		] as const

		return html`
			<h1>${this.locale.t("litSettings.integrations")}</h1>
			<div class="card">
				<div class="row" style="margin-bottom:12px">
					<div>
						<div class="label">${this.locale.t("litSettings.webhooksEnable")}</div>
						<div class="desc">${this.locale.t("litSettings.webhooksEnableDesc")}</div>
					</div>
					<input
						type="checkbox"
						.checked=${!!w?.enabled}
						@change=${(e: Event) => {
							void this.patchSettings({
								webhooks: { ...(w || {}), enabled: (e.target as HTMLInputElement).checked },
							})
						}}
					/>
				</div>
				${targets.map(
					([key, label, value]) => html`
						<div style="margin-bottom:12px">
							<div class="label">${label}</div>
							<input
								style="width:100%;margin-top:6px"
								.value=${value}
								placeholder="https://…"
								@change=${(e: Event) => {
									const url = (e.target as HTMLInputElement).value
									const field =
										key === "feishu"
											? "feishuUrl"
											: key === "wechat"
												? "wechatUrl"
												: "genericUrl"
									void this.patchSettings({
										webhooks: { ...(w || {}), [field]: url },
									})
								}}
							/>
							<button
								type="button"
								class="btn"
								style="margin-top:6px"
								@click=${async () => {
									try {
										const g = (
											window as unknown as {
												gcode?: {
													webhooks?: {
														test: (
															t: "feishu" | "wechat" | "generic",
														) => Promise<{ success: boolean; error?: string }>
													}
												}
											}
										).gcode
										const r = await g?.webhooks?.test(key)
										this.webhookTest = {
											...this.webhookTest,
											[key]: r?.success
												? "ok"
												: r?.error || this.locale.t("litSettings.webhookFail"),
										}
									} catch (err) {
										this.webhookTest = {
											...this.webhookTest,
											[key]: err instanceof Error ? err.message : String(err),
										}
									}
								}}
							>
								${this.locale.t("litSettings.webhookTest")}
							</button>
							${
								this.webhookTest[key]
									? html`<span class="mono" style="margin-left:8px"
											>${this.webhookTest[key]}</span
										>`
									: null
							}
						</div>
					`,
				)}
			</div>
			<div class="card">
				<div class="label">${this.locale.t("litSettings.skillSync")}</div>
				<div class="desc" style="margin:8px 0">
					${this.locale.t("litSettings.skillSyncDesc")}
				</div>
				<label class="desc">
					host
					<input
						style="width:100%;margin-top:4px"
						.value=${skill?.host || ""}
						@change=${(e: Event) => {
							void this.patchSettings({
								skillSync: {
									...(skill || { remotePath: "", port: 22 }),
									host: (e.target as HTMLInputElement).value,
								},
							})
						}}
					/>
				</label>
				<label class="desc" style="display:block;margin-top:8px">
					remotePath
					<input
						style="width:100%;margin-top:4px"
						.value=${skill?.remotePath || ""}
						@change=${(e: Event) => {
							void this.patchSettings({
								skillSync: {
									...(skill || { host: "", port: 22 }),
									remotePath: (e.target as HTMLInputElement).value,
								},
							})
						}}
					/>
				</label>
				<div class="row" style="margin-top:12px;gap:8px">
					<button
						type="button"
						class="btn"
						@click=${async () => {
							try {
								const g = (
									window as unknown as {
										gcode?: {
											skills?: {
												sync: (d: "push" | "pull") => Promise<{ success?: boolean; error?: string }>
											}
										}
									}
								).gcode
								const r = await g?.skills?.sync("push")
								this.error = r?.error || (r?.success === false ? "push failed" : "")
							} catch (err) {
								this.error = err instanceof Error ? err.message : String(err)
							}
						}}
					>
						${this.locale.t("litSettings.skillPush")}
					</button>
					<button
						type="button"
						class="btn"
						@click=${async () => {
							try {
								const g = (
									window as unknown as {
										gcode?: {
											skills?: {
												sync: (d: "push" | "pull") => Promise<{ success?: boolean; error?: string }>
											}
										}
									}
								).gcode
								const r = await g?.skills?.sync("pull")
								this.error = r?.error || (r?.success === false ? "pull failed" : "")
							} catch (err) {
								this.error = err instanceof Error ? err.message : String(err)
							}
						}}
					>
						${this.locale.t("litSettings.skillPull")}
					</button>
				</div>
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
			<h1>${this.locale.t("litSettings.worktrees")}</h1>
			<div class="card">
				<div class="desc" style="margin-bottom:12px">
					${this.locale.t("litSettings.worktreeBody")}
				</div>
				${
					this.loading === "worktree"
						? html`<div class="mono">…</div>`
						: this.worktrees.length === 0
							? html`<div class="mono">${this.locale.t("litSettings.worktreeEmpty")}</div>`
							: this.worktrees.map(
									(wt) => html`
										<div class="row" style="margin-bottom:10px;align-items:flex-start">
											<div>
												<div class="label mono">${wt.directory}</div>
												<div class="desc">${wt.projectName}</div>
											</div>
											<div style="display:flex;gap:6px">
												<button
													type="button"
													class="btn"
													@click=${async () => {
														await this.loadWorktrees()
													}}
												>
													${this.locale.t("litSettings.worktreeReset")}
												</button>
												<button
													type="button"
													class="btn danger"
													@click=${async () => {
														await this.loadWorktrees()
													}}
												>
													${this.locale.t("litSettings.worktreeRemove")}
												</button>
											</div>
										</div>
									`,
								)
				}
				<button type="button" class="btn" @click=${() => this.loadWorktrees()}>
					${this.locale.t("litSettings.refresh")}
				</button>
			</div>
		`
	}

	private renderSetup() {
		const onboarding = readOnboardingState()
		return html`
			<h1>${this.locale.t("litSettings.setup")}</h1>
			<div class="card">
				<div class="label">${this.locale.t("litSettings.setupRuntimes")}</div>
				<div class="desc" style="margin-bottom:12px">
					${this.locale.t("litSettings.setupRuntimesDesc")}
				</div>
				${
					this.loading === "setup"
						? html`<div class="mono">…</div>`
						: this.setupRuntimes.length === 0
							? html`<div class="mono">${this.locale.t("litSettings.providersEmpty")}</div>`
							: this.setupRuntimes.map(
								(runtime) => html`
									<div class="row" style="margin-bottom:10px">
										<div>
											<div class="label">${runtime.displayName}</div>
											<div class="desc">${runtime.description}</div>
											${runtime.warning
												? html`<div class="warning">${runtime.warning}</div>`
												: null}
										</div>
										<div class="mono">
											${runtime.installed ? runtime.version || "installed" : "not installed"}
										</div>
									</div>
								`,
							)
				}
				<button type="button" class="btn" @click=${() => this.loadSetupRuntimes(true)}>
					${this.locale.t("litSettings.setupRescan")}
				</button>
			</div>
			<div class="card">
				<div class="label">${this.locale.t("litSettings.setupImport")}</div>
				<div class="desc" style="margin:6px 0 12px">
					${onboarding.migrationPerformed
						? `${this.locale.t("litSettings.setupImportedFrom")}: ${onboarding.migratedFrom.join(", ") || "—"}`
						: this.locale.t("litSettings.setupNoImport")}
				</div>
				<button
					type="button"
					class="btn"
					?disabled=${this.loading === "restore"}
					@click=${async () => {
						const restore = window.gcode?.onboarding?.restoreBackup
						if (!restore) {
							this.error = this.locale.t("litSettings.desktopOnly")
							return
						}
						this.loading = "restore"
						this.setupRestoreResult = ""
						try {
							const result = await restore()
							this.setupRestoreResult = result.success
								? `${this.locale.t("litSettings.setupRestoreDone")} (${result.restored.length})`
								: result.errors.join(", ") || this.locale.t("litSettings.webhookFail")
						} catch (err) {
							this.setupRestoreResult = err instanceof Error ? err.message : String(err)
						} finally {
							this.loading = ""
						}
					}}
				>
					${this.locale.t("litSettings.setupRestore")}
				</button>
				${this.setupRestoreResult ? html`<span class="mono" style="margin-left:8px">${this.setupRestoreResult}</span>` : null}
			</div>
			<div class="card">
				<div class="label">${this.locale.t("litSettings.setupOnboarding")}</div>
				<div class="desc" style="margin:6px 0 12px">${this.locale.t("litSettings.setupOnboardingDesc")}</div>
				<button
					type="button"
					class="btn"
					@click=${() => {
						markOnboardingIncomplete()
						if (window.gcode?.relaunch) {
							void window.gcode.relaunch()
							return
						}
						location.hash = "#/onboarding"
					}}
				>
					${this.locale.t("litSettings.setupRerun")}
				</button>
			</div>
		`
	}

	private renderUsage() {
		const u = this.usage
		const recent = u.daily.slice(-30)
		const maxCost = Math.max(...recent.map((d) => d.cost), 0.0001)
		return html`
			<h1>${this.locale.t("litSettings.usage")}</h1>
			<div class="stats">
				<div class="stat">
					<div class="stat-label">${this.locale.t("litSettings.usageCost")}</div>
					<div class="stat-value">${formatCost(u.totalCost)}</div>
				</div>
				<div class="stat">
					<div class="stat-label">${this.locale.t("litSettings.usageTokens")}</div>
					<div class="stat-value">${formatTokens(u.totalTokens.total)}</div>
				</div>
				<div class="stat">
					<div class="stat-label">${this.locale.t("litSettings.usageSessions")}</div>
					<div class="stat-value">${u.sessionCount}</div>
				</div>
				<div class="stat">
					<div class="stat-label">${this.locale.t("litSettings.usageProjects")}</div>
					<div class="stat-value">${u.projectCount}</div>
				</div>
			</div>
			${
				recent.length > 0
					? html`
							<div class="card">
								<div class="label">${this.locale.t("litSettings.usageDaily")}</div>
								<div class="chart">
									${recent.map(
										(d) => html`
											<div
												class="bar"
												title=${`${d.date}: ${formatCost(d.cost)}`}
												style="height:${Math.max((d.cost / maxCost) * 100, 2)}%"
											></div>
										`,
									)}
								</div>
							</div>
						`
					: null
			}
			<div class="card">
				<div class="label">${this.locale.t("litSettings.usageByModel")}</div>
				${
					u.models.length === 0
						? html`<div class="mono" style="margin-top:8px">
								${this.locale.t("litSettings.usageEmpty")}
							</div>`
						: html`
								<table class="table">
									<thead>
										<tr>
											<th>Model</th>
											<th>Tokens</th>
											<th>Cost</th>
										</tr>
									</thead>
									<tbody>
										${u.models.slice(0, 12).map(
											(m) => html`
												<tr>
													<td>${m.providerID}/${m.modelID}</td>
													<td>${formatTokens(m.tokens)}</td>
													<td>${formatCost(m.cost)}</td>
												</tr>
											`,
										)}
									</tbody>
								</table>
							`
				}
			</div>
			<button
				type="button"
				class="btn"
				?disabled=${this.loading === "usage"}
				@click=${() => this.loadUsage()}
			>
				${this.locale.t("litSettings.usageRefresh")}
			</button>
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
			case "plugins":
				return this.renderPlugins()
			case "integrations":
				return this.renderIntegrations()
			case "notifications":
				return this.renderNotifications()
			case "worktrees":
				return this.renderWorktree()
			case "usage":
				return this.renderUsage()
			case "setup":
				return this.renderSetup()
			case "about":
				return this.renderAbout()
			default:
				return this.renderGeneral()
		}
	}

	render() {
		const sections = this.visibleSections()
		const requestedSection = this.section || "general"
		const section = sections.includes(requestedSection as Section) ? requestedSection : "general"
		return html`
			<nav class="nav">
				<div class="titlebar-spacer" aria-hidden="true"></div>
				<a class="back" href="#/">← Back to app</a>
				<div class="nav-list">
				${sections.map(
					(s) => html`
						<a
							href=${`#/settings/${s}`}
							data-active=${String(s === section)}
						>
							${this.sectionLabel(s)}
						</a>
					`,
				)}
				</div>
			</nav>
			<div class="content">
				<div class="content-inner">
					${this.error ? html`<div class="error">${this.error}</div>` : null}
					${this.renderSection(section)}
				</div>
			</div>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"gcode-settings-panel": GcodeSettingsPanel
	}
}
