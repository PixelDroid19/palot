/**
 * New-session home.
 *
 * The visual hierarchy follows the established desktop reference: a centered prompt
 * catalogue and a bottom composer. Runtime launch remains ACP-native.
 */
import { html, LitElement } from "lit"
import { customElement, state } from "lit/decorators.js"
import type { SessionRuntimeDescriptor } from "../../../preload/api"
import { BusTopics, emitBubbled, gcodeBus } from "../bus"
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

const CLI_PREFS_KEY = "gcode:cliRuntimePrefs"

interface CliRuntimePrefs {
	model: string
	effort: string
	sandbox: string
}

function loadCliPrefs(runtimeId: string): CliRuntimePrefs | null {
	try {
		const all = JSON.parse(localStorage.getItem(CLI_PREFS_KEY) || "{}") as Record<
			string,
			CliRuntimePrefs
		>
		return all[runtimeId] ?? null
	} catch {
		return null
	}
}

function saveCliPrefs(runtimeId: string, prefs: CliRuntimePrefs): void {
	try {
		const all = JSON.parse(localStorage.getItem(CLI_PREFS_KEY) || "{}") as Record<
			string,
			CliRuntimePrefs
		>
		all[runtimeId] = prefs
		localStorage.setItem(CLI_PREFS_KEY, JSON.stringify(all))
	} catch {
		// Preferences are convenience state; a storage failure must not block launch.
	}
}

@customElement("gcode-home")
export class GcodeHome extends LitElement {
	static styles = styles
	private locale = new LocaleController(this)

	@state() private runtimes: SessionRuntimeDescriptor[] = []
	@state() private runtimeId = ""
	@state() private modelId = ""
	@state() private effort = ""
	@state() private sandbox = "read-only"
	@state() private cwd = ""
	@state() private draft = ""
	@state() private busy = false
	@state() private error = ""
	private unsubSessions: (() => void) | null = null

	connectedCallback(): void {
		super.connectedCallback()
		this.syncProjectDirectory()
		this.unsubSessions = gcodeBus.subscribe(BusTopics.sessionListChanged, () => this.syncProjectDirectory())
		void this.loadRuntimes()
	}

	disconnectedCallback(): void {
		this.unsubSessions?.()
		this.unsubSessions = null
		super.disconnectedCallback()
	}

	private syncProjectDirectory(): void {
		const projects = sessionStore
			.list()
			.filter((session) => !!session.directory)
			.sort((a, b) => b.updatedAt - a.updatedAt)
		const selected = projects.find((session) => session.directory === this.cwd) ?? projects[0]
		const next = selected?.directory ?? ""
		if (next !== this.cwd) this.cwd = next
	}

	private projectName(): string {
		const normalized = this.cwd.replaceAll("\\", "/").replace(/\/+$/, "")
		return normalized.split("/").pop() || ""
	}

	private selectedRuntime(): SessionRuntimeDescriptor | undefined {
		return this.runtimes.find((runtime) => runtime.id === this.runtimeId)
	}

	private selectedModel() {
		const runtime = this.selectedRuntime()
		return runtime?.models.find((model) => model.slug === this.modelId) ?? runtime?.models[0]
	}

	private syncRuntimeConfig(): void {
		const model = this.selectedModel()
		if (!model) {
			this.modelId = ""
			this.effort = ""
			return
		}
		if (this.modelId !== model.slug) this.modelId = model.slug
		if (!model.efforts.includes(this.effort)) {
			this.effort = model.defaultEffort || model.efforts[0] || ""
		}
	}

	private restoreRuntimePrefs(runtimeId: string): void {
		const prefs = loadCliPrefs(runtimeId)
		this.modelId = prefs?.model ?? ""
		this.effort = prefs?.effort ?? ""
		this.sandbox = prefs?.sandbox ?? "read-only"
		this.syncRuntimeConfig()
	}

	private persistRuntimePrefs(): void {
		if (!this.runtimeId) return
		saveCliPrefs(this.runtimeId, {
			model: this.modelId,
			effort: this.effort,
			sandbox: this.sandbox,
		})
	}

	private onRuntimeChange(runtimeId: string): void {
		this.runtimeId = runtimeId
		this.restoreRuntimePrefs(runtimeId)
	}

	private onModelChange(modelId: string): void {
		this.modelId = modelId
		this.effort = ""
		this.syncRuntimeConfig()
		this.persistRuntimePrefs()
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
			this.restoreRuntimePrefs(this.runtimeId)
		} catch (err) {
			this.runtimes = []
			this.error = err instanceof Error ? err.message : String(err)
		}
	}

	private async start(promptText = this.draft): Promise<void> {
		const text = promptText.trim()
		if (!text) return
		this.error = ""
		if (!this.runtimeId || !this.cwd) {
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
								options: {
									cwd: string
									sandbox?: string
									model?: string
									reasoningEffort?: string
								},
							) => Promise<unknown>
						}
					}
				}
			).gcode
			if (!bridge?.agentSession) {
				throw new Error("Desktop agentSession bridge is required for CLI sessions.")
			}
			this.persistRuntimePrefs()
			sessionStore.upsertAndPersist({
				id,
				title: this.locale.t("litShell.newSessionTitle"),
				runtimeId: this.runtimeId,
				directory: this.cwd,
				model: this.modelId || undefined,
				effort: this.effort || undefined,
				sandbox: this.sandbox,
			})
			await bridge.agentSession.open(id, this.runtimeId, {
				cwd: this.cwd,
				sandbox: this.sandbox,
				model: this.modelId || undefined,
				reasoningEffort: this.effort || undefined,
			})
			sessionStore.select(id)
			this.draft = ""
			emitBubbled(this, "gcode-home-submit", { sessionId: id, text })
			navigate(`/session/${id}`)
		} catch (err) {
			this.error = err instanceof Error ? err.message : String(err)
		} finally {
			this.busy = false
		}
	}

	private onPromptKeydown(event: KeyboardEvent): void {
		if (event.key !== "Enter" || event.shiftKey || event.isComposing) return
		event.preventDefault()
		void this.start()
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
		const canCompose = !!this.runtimeId && !!this.cwd && !this.busy
		const runtime = this.selectedRuntime()
		const model = this.selectedModel()
		return html`
			<section class="home" aria-label=${this.locale.t("litShell.newSession")}>
				<div class="hero-area">
					<div class="hero-content">
						<div class="wordmark"><gcode-wordmark></gcode-wordmark></div>
						<div class="hero-heading">
							<h1>Build what's next</h1>
							${this.projectName() ? html`<p class="project-name">${this.projectName()}</p>` : null}
						</div>
						<div class="suggestions">
							${SUGGESTIONS.map(
								(suggestion, index) => html`
									<button
										type="button"
										class="suggestion"
										?disabled=${!canCompose}
										@click=${() => void this.start(suggestion)}
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
							@keydown=${(event: KeyboardEvent) => this.onPromptKeydown(event)}
							@input=${(event: Event) => {
								this.draft = (event.target as HTMLTextAreaElement).value
							}}
						></textarea>
						${runtime && (runtime.models.length > 0 || runtime.capabilities.sandboxModes)
							? html`
								<div class="config-toolbar" aria-label="Session configuration">
										${runtime.models.length > 0
											? html`<select
												aria-label="Model"
												.value=${this.modelId}
												?disabled=${this.busy}
												@change=${(event: Event) =>
													this.onModelChange((event.target as HTMLSelectElement).value)}
											>
												${runtime.models.map(
													(modelOption) => html`<option
														value=${modelOption.slug}
														?selected=${modelOption.slug === this.modelId}
													>
														${modelOption.label}
													</option>`,
												)}
											</select>`
											: null}
										${runtime.capabilities.sandboxModes
											? html`<select
												aria-label="Sandbox mode"
												.value=${this.sandbox}
												?disabled=${this.busy}
													@change=${(event: Event) => {
														this.sandbox = (event.target as HTMLSelectElement).value
														this.persistRuntimePrefs()
													}}
											>
												<option value="plan">Plan</option>
												<option value="read-only">Read only</option>
												<option value="workspace-write">Workspace write</option>
												<option value="danger-full-access">Full access</option>
											</select>`
											: null}
										${model?.efforts.length
											? html`<select
												aria-label="Reasoning effort"
												.value=${this.effort}
												?disabled=${this.busy}
													@change=${(event: Event) => {
														this.effort = (event.target as HTMLSelectElement).value
														this.persistRuntimePrefs()
													}}
											>
												${model.efforts.map(
													(effort) => html`<option value=${effort} ?selected=${effort === this.effort}>
														${effort.charAt(0).toUpperCase() + effort.slice(1)}
													</option>`,
												)}
											</select>`
											: null}
									</div>
								`
								: null}
						</div>
						${
							runtime
								? html`<div class="status-bar">
									<span class="status-local"><span class="status-dot"></span>Local</span>
									<select
										class="runtime-select"
										aria-label=${this.locale.t("runtimePicker.runtime")}
										.value=${this.runtimeId}
										?disabled=${this.busy}
										@change=${(event: Event) =>
											this.onRuntimeChange((event.target as HTMLSelectElement).value)}
									>
										${this.runtimes
											.filter((runtimeOption) => runtimeOption.installed)
											.map(
												(runtimeOption) => html`<option
													value=${runtimeOption.id}
													?selected=${runtimeOption.id === this.runtimeId}
												>
													${runtimeOption.displayName || runtimeOption.id}
												</option>`,
											)}
									</select>
								</div>`
								: null
						}
					${
						!this.cwd
							? html`<p class="workspace-empty">
								No workspaces visible yet. Add a project folder, or restore hidden projects from the sidebar —
								Claude, Codex, and OpenCode share the same workspace list.
							</p>`
							: null
					}
					${
						this.error
							? html`<p class="error" role="alert">${this.error}</p>`
							: null
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
