/**
 * Health/connection status dot — progressive Lit leaf used by ServerIndicator.
 */
import { LitElement } from "lit"
import { customElement, property } from "lit/decorators.js"
import {
	healthToStatusDotKind,
	statusDotKindLabel,
	type HealthState,
	type StatusDotKind,
} from "../status-dot"
import { styles } from "./gcode-status-dot.css.js"

function parseHealthAttr(value: string | null): HealthState {
	if (value == null || value === "" || value === "null" || value === "checking") return null
	if (value === "true" || value === "1" || value === "ok") return true
	if (value === "false" || value === "0" || value === "bad") return false
	return null
}

@customElement("gcode-status-dot")
export class GcodeStatusDotElement extends LitElement {
	static styles = styles

	@property({
		attribute: "health",
		reflect: true,
		converter: {
			fromAttribute: (value: string | null) => parseHealthAttr(value),
			toAttribute: (value: HealthState) =>
				value === null ? "null" : value ? "true" : "false",
		},
	})
	health: HealthState = null

	/** sm (list row) | md (sidebar badge overlay) */
	@property({ type: String })
	size: "sm" | "md" = "sm"

	@property({ type: Boolean, reflect: true })
	bordered = false

	private kind(): StatusDotKind {
		return healthToStatusDotKind(this.health)
	}

	protected updated(): void {
		const kind = this.kind()
		this.setAttribute("data-kind", kind)
		this.setAttribute("data-size", this.size || "sm")
		this.setAttribute("role", "status")
		this.setAttribute("aria-label", statusDotKindLabel(kind))
		this.title = statusDotKindLabel(kind)
	}

	render() {
		return undefined
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"gcode-status-dot": GcodeStatusDotElement
	}
}
