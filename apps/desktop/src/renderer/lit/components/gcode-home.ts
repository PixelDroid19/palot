/**
 * New-session home.
 *
 * The visual hierarchy follows the established desktop reference: a centered prompt
 * catalogue and a bottom composer. Runtime launch remains ACP-native.
 */
import { html, LitElement } from "lit"
import { customElement, state } from "lit/decorators.js"
import type { SessionRuntimeDescriptor } from "../../../preload/api"
import { LocaleController } from "../locale-controller"
import { navigate } from "../router"
import { sessionStore } from "../session-store"
import { styles } from "./gcode-home.css.js"

const SUGGESTIONS = [
	"Build a new feature based on the existing patterns in this repo.",
	"Summarize the architecture and key design decisions.",
	"Review recent changes and suggest improvements.",
	"Generate a knowledge base: explore the whole codebase and write or update AGENTS.md with the architecture, key modules, conventions, build/test commands, and gotchas a new contributor needs.",
] as const

@customElement("gcode-home")
export class GcodeHome extends LitElement {
	static styles = styles
	private locale = new LocaleController(this)

	@state() private runtimes: SessionRuntimeDescriptor[] = []
	@state() private runtimeId = ""
	@state() private cwd = ""
	@state() private draft = ""
	@state() private busy = false
	@state() private error = ""

	connectedCallback(): void {
		super.connectedCallback()
		void this.loadRuntimes()
	}

	private async loadRuntimes(): Promise<void> {
		this.error = ""
		try {
			const g = (
				window as unknown as {
					gcode?: {
						agentSession?: {
							describeRuntimes?: () => Promise<SessionRuntimeDescriptor[]>
						}
					}
				}
			).gcode
			if (!g?.agentSession?.describeRuntimes) {
				// Browser mode has no preload bridge; keep launch controls disabled.
				this.runtimes = []
				return
			}
			const list = await g.agentSession.describeRuntimes()
			this.runtimes = list
			const installed = list.find((runtime) => runtime.installed)
			if (installed) this.runtimeId = installed.id
			else if (list[0]) this.runtimeId = list[0].id
		} catch (err) {
			this.runtimes = []
			this.error = err instanceof Error ? err.message : String(err)
		}
	}

	private async pickDir(): Promise<void> {
		try {
			const g = (
				window as unknown as { gcode?: { pickDirectory?: () => Promise<string | null> } }
			).gcode
			const dir = await g?.pickDirectory?.()
			if (dir) this.cwd = dir
		} catch {
			// Native picker cancellation is an expected no-op.
		}
	}

	private async start(): Promise<void> {
		this.error = ""
		if (!this.runtimeId || !this.cwd) {
			this.error = this.locale.t("subagentChat.noneInstalled")
			return
		}
		this.busy = true
		try {
			const id = crypto.randomUUID()
			const bridge = (
				window as unknown as {
					gcode?: {
						agentSession?: {
							open: (
								sessionId: string,
								runtimeId: string,
								options: { cwd: string; sandbox?: string },
							) => Promise<unknown>
						}
					}
				}
			).gcode
			if (!bridge?.agentSession) {
				throw new Error("Desktop agentSession bridge is required for CLI sessions.")
			}
			sessionStore.upsertAndPersist({
				id,
				title: this.locale.t("litShell.newSessionTitle"),
				runtimeId: this.runtimeId,
				directory: this.cwd,
			})
			await bridge.agentSession.open(id, this.runtimeId, {
				cwd: this.cwd,
				sandbox: "workspace-write",
			})
			sessionStore.select(id)
			navigate(`/session/${id}`)
		} catch (err) {
			this.error = err instanceof Error ? err.message : String(err)
		} finally {
			this.busy = false
		}
	}

	private renderSuggestionIcon(index: number) {
		const paths = [
			html`<path d="m6 4-3 4 3 4M10 4l3 4-3 4M8.5 3 7.5 13" />`,
			html`<path d="M4 2.75h5l3 3V13.25H4zM9 2.75v3h3M6 8h4M6 10.5h4" />`,
			html`<path d="M5 3v10M5 5h5a2 2 0 0 1 0 4H5M5 9h4l3 4" />`,
			html`<path d="M3.5 3.5h6l3 3v6h-9zM9.5 3.5v3h3M5.5 8h5M5.5 10.5h3" />`,
		]
		return html`<svg viewBox="0 0 16 16" aria-hidden="true">${paths[index] ?? paths[0]}</svg>`
	}

	render() {
		const canLaunch = !!this.runtimeId && !!this.cwd && !this.busy
		const canCompose = !!this.runtimeId && !!this.cwd
		return html`
			<section class="home" aria-label=${this.locale.t("litShell.newSession")}>
				<div class="hero-area">
					<div class="hero-content">
						<div class="wordmark"><gcode-wordmark></gcode-wordmark></div>
						<div class="hero-heading"><h1>Build what's next</h1></div>
						<div class="suggestions">
							${SUGGESTIONS.map(
									(suggestion, index) => html`
									<button
										type="button"
										class="suggestion"
										?disabled=${!canCompose}
										@click=${() => {
											this.draft = suggestion
										}}
									>
										<span class="suggestion-mark">${this.renderSuggestionIcon(index)}</span>
										<p>${suggestion}</p>
									</button>
								`,
							)}
						</div>
					</div>
				</div>

				<div class="composer-area">
					<div class="composer-shell">
						<textarea
							placeholder="What should this session work on?"
							.value=${this.draft}
							?disabled=${!canCompose}
							@input=${(event: Event) => {
								this.draft = (event.target as HTMLTextAreaElement).value
							}}
						></textarea>
						${
							this.runtimeId
								? html`
									<div class="launch-controls">
										<label>
											<span>${this.locale.t("runtimePicker.runtime")}</span>
											<select
												.value=${this.runtimeId}
												@change=${(event: Event) => {
													this.runtimeId = (event.target as HTMLSelectElement).value
												}}
											>
												${this.runtimes.map(
													(runtime) => html`
														<option value=${runtime.id} ?selected=${runtime.id === this.runtimeId}>
															${runtime.displayName || runtime.id}
														</option>
													`,
												)}
											</select>
										</label>
										<label class="directory-control">
											<span>${this.locale.t("subagent.workingDirLabel")}</span>
											<input
												.value=${this.cwd}
												placeholder=${this.locale.t("subagent.workingDirPlaceholder")}
												@input=${(event: Event) => {
													this.cwd = (event.target as HTMLInputElement).value
												}}
											/>
											<button type="button" class="pick-directory" @click=${() => this.pickDir()}>
												Browse
											</button>
										</label>
									</div>
								`
								: null
						}
					</div>
					${
						this.runtimeId
							? html`
								<button
									type="button"
									class="start"
									?disabled=${!canLaunch}
									@click=${() => this.start()}
								>
									${this.busy ? "Starting…" : this.locale.t("litShell.newSession")}
								</button>
							`
							: null
					}
					${
						this.error
							? html`<p class="error" role="alert">${this.error}</p>`
							: html`
								<p class="workspace-hint">
									No workspaces visible yet. Add a project folder, or restore hidden projects from the
									sidebar — Claude, Codex, and OpenCode share the same workspace list.
								</p>
							`
					}
				</div>
			</section>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"gcode-home": GcodeHome
	}
}
