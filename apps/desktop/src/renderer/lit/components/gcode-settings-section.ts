/**
 * Settings section chrome — progressive Lit of SettingsSection.
 */
import { html, LitElement, nothing } from "lit"
import { customElement, property } from "lit/decorators.js"
import { styles } from "./gcode-settings-section.css.js"

@customElement("gcode-settings-section")
export class GcodeSettingsSectionElement extends LitElement {
	static styles = styles

	/**
	 * Named `heading` (not `title`) so the property never shadows
	 * `HTMLElement.title` — a `title` attribute would trigger native tooltips
	 * and desync from the Lit property.
	 */
	@property({ type: String }) heading = ""
	@property({ type: String }) description = ""

	render() {
		const sectionId = this.heading ? "gcode-settings-section-title" : undefined
		return html`
			<section
				class="section"
				data-slot="settings-section"
				aria-labelledby=${sectionId ?? nothing}
			>
				${
					this.heading
						? html`
								<div class="heading">
									<h3 class="title" id=${sectionId}>${this.heading}</h3>
									${
										this.description
											? html`<p class="desc">${this.description}</p>`
											: nothing
									}
								</div>
							`
						: nothing
				}
				<div class="list"><slot></slot></div>
			</section>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"gcode-settings-section": GcodeSettingsSectionElement
	}
}
