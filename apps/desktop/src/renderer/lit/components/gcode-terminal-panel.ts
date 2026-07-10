/**
 * Framework-free embedded terminal for a session workspace.
 * The PTY remains host-owned through window.gcode.terminal; this element only
 * renders xterm and forwards lifecycle/input events.
 */
import { FitAddon } from "@xterm/addon-fit"
import { Terminal } from "@xterm/xterm"
import "@xterm/xterm/css/xterm.css"
import { html, LitElement } from "lit"
import { customElement, property, query } from "lit/decorators.js"
import { styles } from "./gcode-terminal-panel.css.js"

const THEME = {
	background: "#00000000",
	foreground: "#e4e4e7",
	cursor: "#e4e4e7",
	selectionBackground: "#3f3f46",
	black: "#18181b",
	brightBlack: "#52525b",
}

@customElement("gcode-terminal-panel")
export class GcodeTerminalPanel extends LitElement {
	static styles = styles

	@property({ type: String, attribute: "session-id" }) sessionId = ""
	@property({ type: String }) cwd = ""
	@query(".terminal") private container?: HTMLDivElement

	private dispose: (() => void) | null = null

	protected firstUpdated(): void {
		void this.openTerminal()
	}

	protected updated(changed: Map<string, unknown>): void {
		if (changed.has("sessionId") || changed.has("cwd")) void this.openTerminal()
	}

	disconnectedCallback(): void {
		this.closeTerminal()
		super.disconnectedCallback()
	}

	private closeTerminal(): void {
		this.dispose?.()
		this.dispose = null
	}

	private async openTerminal(): Promise<void> {
		this.closeTerminal()
		if (!this.sessionId || !this.cwd || !this.container || !window.gcode?.terminal) return

		const id = `term-${this.sessionId}`
		const term = new Terminal({
			fontFamily: '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
			fontSize: 12,
			cursorBlink: true,
			allowTransparency: true,
			theme: THEME,
			scrollback: 5000,
		})
		const fit = new FitAddon()
		term.loadAddon(fit)
		term.open(this.container)
		fit.fit()

		try {
			await window.gcode.terminal.create(id, this.cwd, { cols: term.cols, rows: term.rows })
		} catch (error) {
			term.write(`\r\n\x1b[31m${error instanceof Error ? error.message : String(error)}\x1b[0m\r\n`)
		}

		const offData = window.gcode.terminal.onData((terminalId, data) => {
			if (terminalId === id) term.write(data)
		})
		const offExit = window.gcode.terminal.onExit((terminalId) => {
			if (terminalId === id) {
				term.write("\r\n\x1b[90m[process exited — reopen terminal to start again]\x1b[0m\r\n")
			}
		})
		const input = term.onData((data) => {
			void window.gcode.terminal.input(id, data)
		})
		const resize = () => {
			try {
				fit.fit()
				void window.gcode.terminal.resize(id, term.cols, term.rows)
			} catch {
				// The panel can be temporarily hidden while layout settles.
			}
		}
		const observer = new ResizeObserver(resize)
		observer.observe(this.container)
		const frame = requestAnimationFrame(resize)

		this.dispose = () => {
			cancelAnimationFrame(frame)
			observer.disconnect()
			offData()
			offExit()
			input.dispose()
			void window.gcode.terminal.kill(id)
			term.dispose()
		}
	}

	render() {
		if (!window.gcode?.terminal) {
			return html`<div class="unavailable">The terminal is available in the desktop app.</div>`
		}
		return html`<div class="terminal" aria-label="Session terminal"></div>`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"gcode-terminal-panel": GcodeTerminalPanel
	}
}
