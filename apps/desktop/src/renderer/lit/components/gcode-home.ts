/**
 * New-session home — pick runtime and start a conversation.
 * Fail-closed: no fake installed runtimes when bridge is missing.
 */
import { html, LitElement } from "lit"
import { customElement, state } from "lit/decorators.js"
import type { SessionRuntimeDescriptor } from "../../../preload/api"
import { LocaleController } from "../locale-controller"
import { createManagedSession } from "../managed-chat"
import { navigate } from "../router"
import { sessionStore } from "../session-store"
import { styles } from "./gcode-home.css.js"

@customElement("gcode-home")
export class GcodeHome extends LitElement {
	static styles = styles
	private locale = new LocaleController(this)

	@state() private runtimes: SessionRuntimeDescriptor[] = []
	@state() private runtimeId = ""
	@state() private cwd = ""
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
				this.runtimes = []
				this.error = this.locale.t("litShell.turnFailed", {
					error: "Desktop agentSession bridge required to list runtimes.",
				})
				return
			}
			const list = await g.agentSession.describeRuntimes()
			this.runtimes = list
			const installed = this.runtimes.find((r) => r.installed)
			if (installed) this.runtimeId = installed.id
			else if (this.runtimes[0]) this.runtimeId = this.runtimes[0].id
		} catch (err) {
			this.runtimes = []
			this.error = err instanceof Error ? err.message : String(err)
		}
	}

	private async pickDir(): Promise<void> {
		try {
			const g = (
				window as unknown as {
					gcode?: { pickDirectory?: () => Promise<string | null> }
				}
			).gcode
			const dir = await g?.pickDirectory?.()
			if (dir) this.cwd = dir
		} catch {
			// user cancelled
		}
	}

	private async start(): Promise<void> {
		this.error = ""
		if (!this.runtimeId) {
			this.error = this.locale.t("subagentChat.noneInstalled")
			return
		}
		this.busy = true
		try {
			if (this.runtimeId === "opencode") {
				const session = await createManagedSession(this.locale.t("litShell.newSessionTitle"))
				navigate(`/session/${session.id}`)
				return
			}
			const id = crypto.randomUUID()
			const cwd = this.cwd || ""
			sessionStore.upsertAndPersist({
				id,
				title: this.locale.t("litShell.newSessionTitle"),
				runtimeId: this.runtimeId,
				directory: cwd,
			})
			const bridge = (
				window as unknown as {
					gcode?: {
						agentSession?: {
							open: (
								a: string,
								b: string,
								c: { cwd: string; sandbox?: string },
							) => Promise<unknown>
						}
					}
				}
			).gcode
			if (!bridge?.agentSession) {
				throw new Error("Desktop agentSession bridge is required for Claude/Codex sessions.")
			}
			await bridge.agentSession.open(id, this.runtimeId, {
				cwd: cwd || ".",
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

	render() {
		return html`
			<div class="card">
				<h1>${this.locale.t("litShell.welcomeTitle")}</h1>
				<p>${this.locale.t("litShell.welcomeBody")}</p>
				<label>
					${this.locale.t("runtimePicker.runtime")}
					<select
						.value=${this.runtimeId}
						@change=${(e: Event) => {
							this.runtimeId = (e.target as HTMLSelectElement).value
						}}
					>
						${this.runtimes.map(
							(r) => html`
								<option value=${r.id} ?selected=${r.id === this.runtimeId}>
									${r.displayName || r.id}${r.installed === false ? " (…)" : ""}
								</option>
							`,
						)}
					</select>
				</label>
				${
					this.runtimeId && this.runtimeId !== "opencode"
						? html`
								<label>
									${this.locale.t("subagent.workingDirLabel")}
									<input
										.value=${this.cwd}
										placeholder=${this.locale.t("subagent.workingDirPlaceholder")}
										@input=${(e: Event) => {
											this.cwd = (e.target as HTMLInputElement).value
										}}
									/>
								</label>
								<button type="button" @click=${() => this.pickDir()}>…</button>
							`
						: null
				}
				${this.error ? html`<div class="error">${this.error}</div>` : null}
				<button
					type="button"
					class="primary"
					?disabled=${this.busy || !this.runtimeId}
					@click=${() => this.start()}
				>
					${this.locale.t("litShell.newSession")}
				</button>
			</div>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"gcode-home": GcodeHome
	}
}
