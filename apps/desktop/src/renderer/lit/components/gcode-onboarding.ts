/**
 * Onboarding — welcome, CLI detect, scan/preview/execute migration, finish.
 * Uses public window.gcode.onboarding APIs (no stubs).
 */
import { html, LitElement } from "lit"
import { customElement, state } from "lit/decorators.js"
import type {
	MigrationCategory,
	MigrationPreview,
	MigrationProvider,
	MigrationResult,
	ProviderDetection,
	SessionRuntimeDescriptor,
} from "../../../preload/api"
import { LocaleController } from "../locale-controller"
import { markOnboardingComplete, readOnboardingState } from "../onboarding-store"
import { navigate } from "../router"
import { styles } from "./gcode-onboarding.css.js"

const DEFAULT_CATEGORIES: MigrationCategory[] = [
	"config",
	"mcp",
	"agents",
	"commands",
	"skills",
	"permissions",
	"rules",
	"hooks",
	"history",
]

@customElement("gcode-onboarding")
export class GcodeOnboarding extends LitElement {
	static styles = styles
	private locale = new LocaleController(this)

	@state() private step = 0
	@state() private detecting = false
	@state() private migrating = false
	@state() private error = ""
	@state() private providers: ProviderDetection[] = []
	@state() private runtimes: SessionRuntimeDescriptor[] = []
	@state() private selectedProvider: MigrationProvider | null = null
	@state() private scanResult: unknown = null
	@state() private preview: MigrationPreview | null = null
	@state() private result: MigrationResult | null = null
	@state() private categories: MigrationCategory[] = [...DEFAULT_CATEGORIES]

	connectedCallback(): void {
		super.connectedCallback()
		if (readOnboardingState().completed) {
			queueMicrotask(() => navigate("/"))
		}
	}

	private finish(): void {
		markOnboardingComplete()
		navigate("/")
	}

	private async detect(): Promise<void> {
		this.detecting = true
		this.error = ""
		try {
			const g = (
				window as unknown as {
					gcode?: {
						onboarding?: {
							detectProviders?: () => Promise<ProviderDetection[]>
						}
						agentSession?: {
							describeRuntimes?: () => Promise<SessionRuntimeDescriptor[]>
						}
					}
				}
			).gcode
			if (!g) {
				this.error = this.locale.t("litOnboarding.desktopRequired")
				this.providers = []
				this.runtimes = []
				return
			}
			const [providers, runtimes] = await Promise.all([
				g.onboarding?.detectProviders?.() ?? Promise.resolve([]),
				g.agentSession?.describeRuntimes?.() ?? Promise.resolve([]),
			])
			this.providers = providers
			this.runtimes = runtimes
		} catch (err) {
			this.error = err instanceof Error ? err.message : String(err)
		} finally {
			this.detecting = false
		}
	}

	private async previewMigration(provider: MigrationProvider): Promise<void> {
		this.migrating = true
		this.error = ""
		this.selectedProvider = provider
		this.preview = null
		this.result = null
		try {
			const g = (
				window as unknown as {
					gcode?: {
						onboarding?: {
							scanProvider?: (
								p: MigrationProvider,
							) => Promise<{ detection: ProviderDetection; scanResult: unknown }>
							previewMigration?: (
								p: MigrationProvider,
								scan: unknown,
								cats: MigrationCategory[],
							) => Promise<MigrationPreview>
						}
					}
				}
			).gcode
			if (!g?.onboarding?.scanProvider || !g.onboarding.previewMigration) {
				throw new Error(this.locale.t("litOnboarding.desktopRequired"))
			}
			const scanned = await g.onboarding.scanProvider(provider)
			this.scanResult = scanned.scanResult
			this.preview = await g.onboarding.previewMigration(
				provider,
				scanned.scanResult,
				this.categories,
			)
		} catch (err) {
			this.error = err instanceof Error ? err.message : String(err)
		} finally {
			this.migrating = false
		}
	}

	private async executeMigration(): Promise<void> {
		if (!this.selectedProvider || this.scanResult == null) return
		this.migrating = true
		this.error = ""
		try {
			const g = (
				window as unknown as {
					gcode?: {
						onboarding?: {
							executeMigration?: (
								p: MigrationProvider,
								scan: unknown,
								cats: MigrationCategory[],
							) => Promise<MigrationResult>
						}
					}
				}
			).gcode
			if (!g?.onboarding?.executeMigration) {
				throw new Error(this.locale.t("litOnboarding.desktopRequired"))
			}
			this.result = await g.onboarding.executeMigration(
				this.selectedProvider,
				this.scanResult,
				this.categories,
			)
			if (!this.result.success && this.result.errors?.length) {
				this.error = this.result.errors.join("; ")
			}
		} catch (err) {
			this.error = err instanceof Error ? err.message : String(err)
		} finally {
			this.migrating = false
		}
	}

	private async advance(): Promise<void> {
		if (this.step === 0) {
			this.step = 1
			void this.detect()
			return
		}
		if (this.step === 1) {
			this.step = 2
			return
		}
		if (this.step < 3) this.step += 1
	}

	private renderRuntimesStep() {
		return html`
			${
				this.detecting
					? html`<p>${this.locale.t("litOnboarding.detecting")}</p>`
					: html`
							${
								this.runtimes.length > 0
									? html`
											<div class="detect-list">
												${this.runtimes.map(
													(r) => html`
														<div class="detect-row" data-ok=${String(!!r.installed)}>
															<strong>${r.displayName || r.id}</strong>
															<span>
																${r.installed
																	? this.locale.t("litOnboarding.found")
																	: this.locale.t("litOnboarding.missing")}
															</span>
														</div>
													`,
												)}
											</div>
										`
									: null
							}
							${
								this.providers.length > 0
									? html`
											<div class="detect-list" style="margin-top:12px">
												<div class="detect-label">
													${this.locale.t("litOnboarding.migrationSources")}
												</div>
												${this.providers.map(
													(p) => html`
														<div class="detect-row" data-ok=${String(!!p.found)}>
															<strong>${p.label || p.provider}</strong>
															<span>
																${p.found
																	? this.locale.t("litOnboarding.found")
																	: this.locale.t("litOnboarding.missing")}
																${p.found && p.summary ? ` · ${p.summary}` : ""}
															</span>
														</div>
													`,
												)}
											</div>
										`
									: null
							}
							${
								!this.detecting && this.runtimes.length === 0 && this.providers.length === 0
									? html`<p>${this.locale.t("litOnboarding.noClis")}</p>`
									: null
							}
							<button type="button" class="secondary" @click=${() => this.detect()}>
								${this.locale.t("litOnboarding.redetect")}
							</button>
						`
			}
		`
	}

	private renderMigrationStep() {
		const found = this.providers.filter((p) => p.found)
		return html`
			<div class="detect-list">
				${
					found.length === 0
						? html`<p>${this.locale.t("litOnboarding.noMigrationSources")}</p>`
						: found.map(
								(p) => html`
									<div class="detect-row" data-ok="true">
										<strong>${p.label || p.provider}</strong>
										<button
											type="button"
											class="secondary"
											?disabled=${this.migrating}
											@click=${() => this.previewMigration(p.provider)}
										>
											${this.locale.t("litOnboarding.preview")}
										</button>
									</div>
								`,
							)
				}
			</div>
			${
				this.preview
					? html`
							<div class="preview">
								<div class="detect-label">
									${this.locale.t("litOnboarding.previewSummary", {
										files: String(this.preview.fileCount),
										sessions: String(this.preview.sessionCount),
									})}
								</div>
								${this.preview.categories.map(
									(cat) => html`
										<div class="preview-cat">
											<strong>${cat.category}</strong> · ${cat.itemCount}
											${cat.files.slice(0, 8).map(
												(f) => html`<div class="mono file">${f.path} (${f.status})</div>`,
											)}
										</div>
									`,
								)}
								${
									this.preview.warnings?.length
										? html`<div class="warn">${this.preview.warnings.join(" · ")}</div>`
										: null
								}
								<button
									type="button"
									class="primary"
									?disabled=${this.migrating}
									@click=${() => this.executeMigration()}
								>
									${this.locale.t("litOnboarding.execute")}
								</button>
							</div>
						`
					: null
			}
			${
				this.result
					? html`
							<div class="preview" data-ok=${String(this.result.success)}>
								<div class="detect-label">
									${this.result.success
										? this.locale.t("litOnboarding.migrateOk")
										: this.locale.t("litOnboarding.migrateFail")}
								</div>
								<div class="mono">
									written: ${this.result.filesWritten?.length ?? 0} · skipped:
									${this.result.filesSkipped?.length ?? 0}
								</div>
							</div>
						`
					: null
			}
		`
	}

	private renderWelcomeStep() {
		return html`
			<div class="welcome-content">
				<div class="wordmark"><gcode-wordmark></gcode-wordmark></div>
				<div class="welcome-description">
					<p class="welcome-lead">Your native workspace for multiple coding runtimes.</p>
					<p class="welcome-body">
						GCode unifies OpenCode, Codex, Claude Code, and other adapters behind one session UI — real-time
						streaming, native notifications, and multi-session support without making any single tool the
						product base.
					</p>
				</div>
				<div class="actions">
					<button type="button" class="primary welcome-cta" @click=${() => this.advance()}>
						Get Started
						<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" /></svg>
					</button>
					<p class="hint">This takes less than a minute.</p>
				</div>
			</div>
		`
	}

	render() {
		const titles = [
			this.locale.t("litOnboarding.welcomeTitle"),
			this.locale.t("litOnboarding.runtimesTitle"),
			this.locale.t("litOnboarding.migrateTitle"),
			this.locale.t("litOnboarding.readyTitle"),
		]
		const bodies = [
			this.locale.t("litOnboarding.welcomeBody"),
			this.locale.t("litOnboarding.runtimesBody"),
			this.locale.t("litOnboarding.migrateBody"),
			this.locale.t("litOnboarding.readyBody"),
		]
		return html`
			<div class="onboarding-shell">
				<div class="titlebar-spacer" aria-hidden="true"></div>
				<div class="progress" aria-label="Onboarding progress">
					<div class="dots">
						${[0, 1, 2, 3].map(
							(index) => html`<span
								data-active=${String(index === this.step)}
								data-complete=${String(index < this.step)}
							></span>`,
						)}
					</div>
					<span>${this.step + 1} of 4</span>
				</div>
				<main class="step-area">
					<section class="step-content">
						${this.step === 0
							? this.renderWelcomeStep()
							: html`
									<h1>${titles[this.step]}</h1>
									<p class="body">${bodies[this.step]}</p>
									${this.step === 1 ? this.renderRuntimesStep() : null}
									${this.step === 2 ? this.renderMigrationStep() : null}
									${this.error ? html`<div class="error">${this.error}</div>` : null}
									<div class="actions">
										${this.step < 3
											? html`
													<button type="button" class="primary" @click=${() => this.advance()}>
														${this.locale.t("litOnboarding.next")} →
													</button>
												`
												: html`
														<button type="button" class="primary" @click=${() => this.finish()}>
															${this.locale.t("litOnboarding.finish")}
														</button>
													`}
									</div>
								`
						}
					</section>
				</main>
			</div>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"gcode-onboarding": GcodeOnboarding
	}
}
