/** Framework-free command palette for common product navigation. */
import { html, LitElement } from "lit"
import { customElement, property, query, state } from "lit/decorators.js"
import { navigate } from "../router"
import type { LitSessionSummary } from "../session-store"
import { styles } from "./gcode-command-palette.css.js"

interface PaletteAction {
	label: string
	detail: string
	path: string
	shortcut?: string
}

const ACTIONS: PaletteAction[] = [
	{ label: "New session", detail: "Start a new coding session", path: "/", shortcut: "⌘ N" },
	{ label: "Automations", detail: "View scheduled work", path: "/automations" },
	{ label: "Settings", detail: "Configure GCode", path: "/settings/general" },
]

@customElement("gcode-command-palette")
export class GcodeCommandPalette extends LitElement {
	static styles = styles

	@property({ type: Boolean, reflect: true }) open = false
	@property({ attribute: false }) sessions: LitSessionSummary[] = []
	@state() private queryText = ""
	@query("input") private searchInput?: HTMLInputElement

	protected updated(changed: Map<string, unknown>): void {
		if (changed.has("open") && this.open) {
			this.queryText = ""
			queueMicrotask(() => this.searchInput?.focus())
		}
	}

	private close(): void {
		this.dispatchEvent(new CustomEvent("gcode-palette-close", { bubbles: true, composed: true }))
	}

	private select(path: string): void {
		navigate(path)
		this.close()
	}

	private onKeydown(event: KeyboardEvent): void {
		if (event.key === "Escape") {
			event.preventDefault()
			this.close()
		}
	}

	render() {
		if (!this.open) return null
		const query = this.queryText.trim().toLowerCase()
		const actions = ACTIONS.filter((action) =>
			`${action.label} ${action.detail}`.toLowerCase().includes(query),
		)
		const sessions = this.sessions.filter((session) =>
			`${session.title} ${session.runtimeId} ${session.directory || ""}`.toLowerCase().includes(query),
		)
		return html`
			<div class="backdrop" @mousedown=${(event: MouseEvent) => {
				if (event.target === event.currentTarget) this.close()
			}}>
				<section class="palette" role="dialog" aria-modal="true" aria-label="Command palette">
					<input
						placeholder="Search sessions and actions"
						.value=${this.queryText}
						@input=${(event: Event) => {
							this.queryText = (event.target as HTMLInputElement).value
						}}
						@keydown=${(event: KeyboardEvent) => this.onKeydown(event)}
					/>
					<div class="results">
						${actions.length > 0 ? html`<div class="group-label">Actions</div>` : null}
						${actions.map(
							(action) => html`
								<button type="button" class="result" @click=${() => this.select(action.path)}>
									<span><strong>${action.label}</strong><small>${action.detail}</small></span>
									${action.shortcut ? html`<kbd>${action.shortcut}</kbd>` : null}
								</button>
							`,
						)}
						${sessions.length > 0 ? html`<div class="group-label">Sessions</div>` : null}
						${sessions.slice(0, 12).map(
							(session) => html`
								<button
									type="button"
									class="result"
									@click=${() => this.select(`/session/${session.id}`)}
								>
									<span><strong>${session.title}</strong><small>${session.runtimeId}${session.directory ? ` · ${session.directory}` : ""}</small></span>
								</button>
							`,
						)}
						${actions.length === 0 && sessions.length === 0 ? html`<p class="empty">No results found.</p>` : null}
					</div>
				</section>
			</div>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"gcode-command-palette": GcodeCommandPalette
	}
}
