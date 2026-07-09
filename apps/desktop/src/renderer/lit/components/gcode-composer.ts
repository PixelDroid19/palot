/**
 * Chat composer — emits bubbled `gcode-send` with { text }.
 */
import { html, LitElement } from "lit"
import { customElement, property, state } from "lit/decorators.js"
import { BusTopics, emitBubbled, gcodeBus } from "../bus"
import { LocaleController } from "../locale-controller"
import { styles } from "./gcode-composer.css.js"

@customElement("gcode-composer")
export class GcodeComposer extends LitElement {
	static styles = styles

	private locale = new LocaleController(this)

	@property({ type: Boolean })
	disabled = false

	@property({ type: String })
	placeholder = ""

	@state()
	private text = ""

	private onInput(e: Event): void {
		const el = e.target as HTMLTextAreaElement
		this.text = el.value
	}

	private submit(): void {
		const value = this.text.trim()
		if (!value || this.disabled) return
		const detail = { text: value }
		emitBubbled(this, "gcode-send", detail)
		gcodeBus.publish(BusTopics.chatSend, detail)
		this.text = ""
	}

	private onKeydown(e: KeyboardEvent): void {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault()
			this.submit()
		}
	}

	render() {
		const ph =
			this.placeholder ||
			this.locale.t("subagentChat.inputPlaceholder", { agent: "agent" })
		return html`
			<div class="shell">
				<textarea
					.value=${this.text}
					placeholder=${ph}
					?disabled=${this.disabled}
					@input=${(e: Event) => this.onInput(e)}
					@keydown=${(e: KeyboardEvent) => this.onKeydown(e)}
				></textarea>
				<div class="toolbar">
					<span class="hint">${this.locale.t("litShell.composerHint")}</span>
					<button
						type="button"
						class="send"
						?disabled=${this.disabled || !this.text.trim()}
						@click=${() => this.submit()}
					>
						${this.locale.t("subagentChat.send")}
					</button>
				</div>
			</div>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"gcode-composer": GcodeComposer
	}
}
