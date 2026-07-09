/**
 * Settings — general (language), about, servers status.
 */
import { html, LitElement } from "lit"
import { customElement, property, state } from "lit/decorators.js"
import { AVAILABLE_LOCALES, type Locale } from "../../i18n"
import { fetchRuntimeServerUrl } from "../../services/backend"
import { LocaleController } from "../locale-controller"
import { navigate } from "../router"
import { styles } from "./gcode-settings-panel.css.js"

@customElement("gcode-settings-panel")
export class GcodeSettingsPanel extends LitElement {
	static styles = styles
	private locale = new LocaleController(this)

	@property({ type: String })
	section = "general"

	@state() private serverUrl = ""

	connectedCallback(): void {
		super.connectedCallback()
		void this.loadServer()
	}

	private async loadServer(): Promise<void> {
		try {
			const { url } = await fetchRuntimeServerUrl()
			this.serverUrl = url || ""
		} catch {
			this.serverUrl = ""
		}
	}

	private onLocaleChange(e: Event): void {
		this.locale.setLocale((e.target as HTMLSelectElement).value as Locale)
	}

	private go(section: string): void {
		navigate(`/settings/${section}`)
	}

	render() {
		const section = this.section || "general"
		return html`
			<nav class="nav">
				${["general", "server", "about"].map(
					(s) => html`
						<button
							type="button"
							data-active=${String(s === section)}
							@click=${() => this.go(s)}
						>
							${s === "general"
								? this.locale.t("litSettings.general")
								: s === "server"
									? this.locale.t("litSettings.server")
									: this.locale.t("litSettings.about")}
						</button>
					`,
				)}
			</nav>
			<div class="content">
				${
					section === "general"
						? html`
								<h1>${this.locale.t("litSettings.general")}</h1>
								<div class="card">
									<div class="row">
										<div>
											<div class="label">${this.locale.t("settings.language")}</div>
											<div class="desc">
												${this.locale.t("settings.languageDescription")}
											</div>
										</div>
										<select
											.value=${this.locale.locale}
											@change=${(e: Event) => this.onLocaleChange(e)}
										>
											${AVAILABLE_LOCALES.map(
												(loc) => html`
													<option
														value=${loc}
														?selected=${loc === this.locale.locale}
													>
														${loc === "en" ? "English" : "Español"}
													</option>
												`,
											)}
										</select>
									</div>
								</div>
							`
						: section === "server"
							? html`
									<h1>${this.locale.t("litSettings.server")}</h1>
									<div class="card">
										<div class="label">${this.locale.t("litSettings.serverUrl")}</div>
										<div class="mono">${this.serverUrl || "—"}</div>
									</div>
								`
							: html`
									<h1>${this.locale.t("litSettings.about")}</h1>
									<div class="card">
										<div class="label">GCode</div>
										<div class="desc">${this.locale.t("litSettings.aboutBody")}</div>
									</div>
								`
				}
			</div>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"gcode-settings-panel": GcodeSettingsPanel
	}
}
