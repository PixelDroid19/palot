/**
 * Session runtime brand mark — progressive Lit migration of RuntimeMark.
 * Path data from public runtime-mark-paths; mapping via pure runtime-icons helpers.
 */
import { html, LitElement } from "lit"
import { customElement, property } from "lit/decorators.js"
import {
	runtimeIdToIconKey,
	sessionStatusToIconAnimation,
	type RuntimeIconKey,
} from "../../lib/runtime-icons"
import { runtimeLabel } from "../../lib/session-runtimes"
import {
	CLAUDE_BRAND_FILL,
	CLAUDE_MARK_PATH,
	CODEX_MARK_PATH,
	FALLBACK_CHEVRON_PATH,
	FALLBACK_PROMPT_PATH,
	OPENCODE_MARK_PATH,
} from "../runtime-mark-paths"
import { styles } from "./gcode-runtime-mark.css.js"

@customElement("gcode-runtime-mark")
export class GcodeRuntimeMarkElement extends LitElement {
	static styles = styles

	@property({ type: String, attribute: "runtime-id" })
	runtimeId = ""

	@property({ type: String })
	status = ""

	@property({ type: String })
	label = ""

	@property({ type: Number })
	size = 14

	private key(): RuntimeIconKey {
		return runtimeIdToIconKey(this.runtimeId || null)
	}

	private accessibleLabel(): string {
		if (this.label) return this.label
		if (this.runtimeId) return runtimeLabel(this.runtimeId)
		return "Agent"
	}

	protected updated(): void {
		const animation = sessionStatusToIconAnimation(this.status || null)
		const key = this.key()
		this.setAttribute("data-runtime-icon", key)
		this.setAttribute("data-runtime-animation", animation)
		this.setAttribute("aria-label", this.accessibleLabel())
		this.setAttribute("role", "img")
	}

	private renderMark(key: RuntimeIconKey) {
		const size = this.size || 14
		const label = this.accessibleLabel()
		if (key === "claude") {
			return html`
				<svg
					width=${size}
					height=${size}
					viewBox="0 0 40 40"
					fill="none"
					xmlns="http://www.w3.org/2000/svg"
					aria-hidden="true"
				>
					<title>${label}</title>
					<path d=${CLAUDE_MARK_PATH} fill=${CLAUDE_BRAND_FILL} />
				</svg>
			`
		}
		if (key === "codex") {
			return html`
				<svg
					width=${size}
					height=${size}
					viewBox="0 0 40 40"
					fill="none"
					xmlns="http://www.w3.org/2000/svg"
					aria-hidden="true"
				>
					<title>${label}</title>
					<path d=${CODEX_MARK_PATH} fill="currentColor" />
				</svg>
			`
		}
		if (key === "opencode") {
			return html`
				<svg
					width=${size}
					height=${size}
					viewBox="0 0 24 24"
					fill="none"
					xmlns="http://www.w3.org/2000/svg"
					aria-hidden="true"
				>
					<title>${label}</title>
					<path d=${OPENCODE_MARK_PATH} fill="currentColor" />
				</svg>
			`
		}
		return html`
			<svg
				width=${size}
				height=${size}
				viewBox="0 0 24 24"
				fill="none"
				xmlns="http://www.w3.org/2000/svg"
				aria-hidden="true"
			>
				<title>${label}</title>
				<rect
					class="muted"
					x="3.5"
					y="4.5"
					width="17"
					height="15"
					rx="2.5"
					stroke="currentColor"
					stroke-width="1.75"
				/>
				<path
					class="muted"
					d=${FALLBACK_CHEVRON_PATH}
					stroke="currentColor"
					stroke-width="1.75"
					stroke-linecap="round"
					stroke-linejoin="round"
					fill="none"
				/>
				<path
					class="muted"
					d=${FALLBACK_PROMPT_PATH}
					stroke="currentColor"
					stroke-width="1.75"
					stroke-linecap="round"
					fill="none"
				/>
			</svg>
		`
	}

	render() {
		return this.renderMark(this.key())
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"gcode-runtime-mark": GcodeRuntimeMarkElement
	}
}
