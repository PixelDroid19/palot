import { html, LitElement } from "lit"
import { customElement, state } from "lit/decorators.js"
import { LocaleController } from "../locale-controller"
import { markOnboardingComplete, readOnboardingState } from "../onboarding-store"
import { navigate } from "../router"
import { styles } from "./gcode-onboarding.css.js"

@customElement("gcode-onboarding")
export class GcodeOnboarding extends LitElement {
	static styles = styles
	private locale = new LocaleController(this)
	@state() private step = 0

	private finish(): void {
		markOnboardingComplete()
		navigate("/")
	}

	render() {
		const state = readOnboardingState()
		if (state.completed) {
			// already done
			queueMicrotask(() => navigate("/"))
		}
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
					<div class="step">1 · ${this.locale.t("litOnboarding.stepWelcome")}</div>
					<div class="step">2 · ${this.locale.t("litOnboarding.stepRuntimes")}</div>
					<div class="step">3 · ${this.locale.t("litOnboarding.stepReady")}</div>
				</div>
				${
					this.step < 2
						? html`
								<button
									type="button"
									class="primary"
									@click=${() => {
										this.step += 1
									}}
								>
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
