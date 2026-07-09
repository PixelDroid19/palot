/**
 * Automations list — public backend IPC/HTTP via services/backend.ts
 */
import { html, LitElement } from "lit"
import { customElement, state } from "lit/decorators.js"
import type { Automation } from "../../../preload/api"
import {
	fetchAutomations,
	runAutomationNow,
} from "../../services/backend"
import { LocaleController } from "../locale-controller"
import { styles } from "./gcode-automations.css.js"

@customElement("gcode-automations")
export class GcodeAutomations extends LitElement {
	static styles = styles
	private locale = new LocaleController(this)

	@state() private items: Automation[] = []
	@state() private error = ""
	@state() private loading = true

	connectedCallback(): void {
		super.connectedCallback()
		void this.reload()
	}

	private async reload(): Promise<void> {
		this.loading = true
		this.error = ""
		try {
			this.items = await fetchAutomations()
		} catch (err) {
			this.error = err instanceof Error ? err.message : String(err)
			this.items = []
		} finally {
			this.loading = false
		}
	}

	private async run(id: string): Promise<void> {
		try {
			await runAutomationNow(id)
			await this.reload()
		} catch (err) {
			this.error = err instanceof Error ? err.message : String(err)
		}
	}

	render() {
		return html`
			<h1>${this.locale.t("litAutomations.title")}</h1>
			${this.error ? html`<div class="error">${this.error}</div>` : null}
			${
				this.loading
					? html`<div class="empty">…</div>`
					: this.items.length === 0
						? html`<div class="empty">${this.locale.t("litAutomations.empty")}</div>`
						: html`
								<div class="list">
									${this.items.map(
										(a) => html`
											<div class="row">
												<div>
													<div class="name">${a.name || a.id}</div>
													<div class="meta">${a.id}</div>
												</div>
												<button
													type="button"
													class="primary"
													@click=${() => this.run(a.id)}
												>
													${this.locale.t("litAutomations.runNow")}
												</button>
											</div>
										`,
									)}
								</div>
							`
			}
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"gcode-automations": GcodeAutomations
	}
}
