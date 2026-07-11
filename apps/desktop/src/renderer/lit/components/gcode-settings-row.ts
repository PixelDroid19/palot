/**
 * Settings row chrome — progressive Lit of SettingsRow.
 * Control projects into the default slot.
 */
import { html, LitElement, nothing } from "lit"
import { customElement, property } from "lit/decorators.js"
import { styles } from "./gcode-settings-row.css.js"

/** Focusable/activatable controls a row label forwards its click to. */
const CONTROL_SELECTOR =
	'button, input, select, textarea, [role="switch"], [role="checkbox"], [role="combobox"], [tabindex]'

@customElement("gcode-settings-row")
export class GcodeSettingsRowElement extends LitElement {
	static styles = styles

	@property({ type: String }) label = ""
	@property({ type: String }) description = ""
	/** Accepted for API compatibility; association is done by click forwarding. */
	@property({ type: String, attribute: "html-for" }) htmlFor = ""

	/**
	 * `label[for]` cannot reach the slotted light-DOM control across the shadow
	 * boundary, so clicking the label forwards focus/activation to the first
	 * focusable control in the slot — same UX as the native association.
	 */
	private onLabelClick = (): void => {
		const slot = this.shadowRoot?.querySelector("slot")
		for (const assigned of slot?.assignedElements({ flatten: true }) ?? []) {
			const control = assigned.matches(CONTROL_SELECTOR)
				? assigned
				: assigned.querySelector(CONTROL_SELECTOR)
			if (control instanceof HTMLElement) {
				control.focus()
				control.click()
				return
			}
		}
	}

	render() {
		return html`
			<div class="row" data-slot="settings-row">
				<div class="meta">
					<label class="label" @click=${this.onLabelClick}>${this.label}</label>
					${this.description ? html`<span class="desc">${this.description}</span>` : nothing}
				</div>
				<div class="control"><slot></slot></div>
			</div>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"gcode-settings-row": GcodeSettingsRowElement
	}
}
