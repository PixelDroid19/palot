/**
 * Onboarding — welcome, real CLI/provider detection, finish.
 * Uses window.gcode.onboarding + agentSession.describeRuntimes (Electron only).
 */
import { html, LitElement } from "lit"
import { customElement, state } from "lit/decorators.js"
import type { ProviderDetection, SessionRuntimeDescriptor } from "../../../preload/api"
import { LocaleController } from "../locale-controller"
import { markOnboardingComplete, readOnboardingState } from "../onboarding-store"
import { navigate } from "../router"
import { styles } from "./gcode-onboarding.css.js"

@customElement("gcode-onboarding")
export class GcodeOnboarding extends LitElement {
	static styles = styles
	private locale = new LocaleController(this)

	@state() private step = 0
	@state() private detecting = false
	@state() private error = ""
	@state() private providers: ProviderDetection[] = []
	@state() private runtimes: SessionRuntimeDescriptor[] = []

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

	private async next(): Promise<void> {
		if (this.step === 1 && this.providers.length === 0 && this.runtimes.length === 0) {
			await this.detect()
		}
		if (this.step < 2) this.step += 1
		if (this.step === 1) void this.detect()
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

	render() {
		const titles = [
			this.locale.t("litOnboarding.welcomeTitle"),
			this.locale.t("litOnboarding.runtimesTitle"),
			this.locale.t("litOnboarding.readyTitle"),
		]
		const bodies = [
			this.locale.t("litOnboarding.welcomeBody"),
			this.locale.t("litOnboarding.runtimesBody"),
			this.locale.t("litOnboarding.readyBody"),
		]
		return html`
			<div class="card">
				<h1>${titles[this.step]}</h1>
				<p>${bodies[this.step]}</p>
				<div class="steps">
					<div class="step" data-active=${String(this.step === 0)}>
						1 · ${this.locale.t("litOnboarding.stepWelcome")}
					</div>
					<div class="step" data-active=${String(this.step === 1)}>
						2 · ${this.locale.t("litOnboarding.stepRuntimes")}
					</div>
					<div class="step" data-active=${String(this.step === 2)}>
						3 · ${this.locale.t("litOnboarding.stepReady")}
					</div>
				</div>
				${this.step === 1 ? this.renderRuntimesStep() : null}
				${this.error ? html`<div class="error">${this.error}</div>` : null}
				${
					this.step < 2
						? html`
								<button type="button" class="primary" @click=${() => this.next()}>
									${this.locale.t("litOnboarding.next")}
								</button>
							`
						: html`
								<button type="button" class="primary" @click=${() => this.finish()}>
									${this.locale.t("litOnboarding.finish")}
								</button>
							`
				}
			</div>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"gcode-onboarding": GcodeOnboarding
	}
}
