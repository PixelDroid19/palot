/**
 * Settings panel for Lit shell — language switch (en/es) + back navigation.
 */
import { html, LitElement } from "lit"
import { customElement } from "lit/decorators.js"
import { AVAILABLE_LOCALES, type Locale } from "../../i18n"
import { BusTopics, emitBubbled, gcodeBus } from "../bus"
import { LocaleController } from "../locale-controller"
import { styles } from "./gcode-settings-panel.css.js"

@customElement("gcode-settings-panel")
export class GcodeSettingsPanel extends LitElement {
	static styles = styles

	private locale = new LocaleController(this)

	private onLocaleChange(e: Event): void {
		const value = (e.target as HTMLSelectElement).value as Locale
		this.locale.setLocale(value)
	}

	private onBack(): void {
		emitBubbled(this, "gcode-nav-back", {})
		gcodeBus.publish(BusTopics.nav, { view: "chat" })
	}

	render() {
		return html`
			<button type="button" class="back" @click=${() => this.onBack()}>
				← ${this.locale.t("litShell.back")}
			</button>
			<h1>${this.locale.t("litShell.settings")}</h1>
			<div class="card">
				<div class="row">
					<div>
						<div class="label">${this.locale.t("settings.language")}</div>
						<div class="desc">${this.locale.t("settings.languageDescription")}</div>
					</div>
					<select
						aria-label=${this.locale.t("settings.language")}
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
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"gcode-settings-panel": GcodeSettingsPanel
	}
}
