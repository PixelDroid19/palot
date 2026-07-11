/**
 * Health/connection status dot — progressive Lit leaf used by ServerIndicator.
 * Normalizes string wire values ("true"|"false"|"null") via coerceHealthState.
 */
import { LitElement } from "lit"
import { customElement, property } from "lit/decorators.js"
import {
	coerceHealthState,
	healthToStatusDotKind,
	statusDotKindLabel,
	type HealthState,
	type StatusDotKind,
} from "../status-dot"
import { styles } from "./gcode-status-dot.css.js"

@customElement("gcode-status-dot")
export class GcodeStatusDotElement extends LitElement {
	static styles = styles

	/**
	 * May arrive as boolean|null (typed) or as string wire values.
	 * Always coerce before mapping to kind.
	 */
	@property({
		attribute: "health",
		reflect: true,
		converter: {
			fromAttribute: (value: string | null) => coerceHealthState(value),
			toAttribute: (value: unknown) => {
				const h = coerceHealthState(value)
				return h === null ? "null" : h ? "true" : "false"
			},
		},
	})
	health: HealthState | string = null

	/** sm (list row) | md (sidebar badge overlay) */
	@property({ type: String })
	size: "sm" | "md" = "sm"

	@property({ type: Boolean, reflect: true })
	bordered = false

	/** Public: resolved kind after coercing boolean/string wire values. */
	resolvedKind(): StatusDotKind {
		return healthToStatusDotKind(this.health)
	}

	protected willUpdate(): void {
		// Normalize string values received from a host boundary.
		const coerced = coerceHealthState(this.health)
		if (this.health !== coerced) {
			this.health = coerced
		}
	}

	protected updated(): void {
		const kind = this.resolvedKind()
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
