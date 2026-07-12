/** Descriptor-driven session model, effort and sandbox controls for Lit. */
import { html, LitElement } from "lit"
import { customElement, property, state } from "lit/decorators.js"
import type { SessionRuntimeDescriptor } from "../../../preload/api"
import { switchLitRuntime } from "../chat-runtime"
import { sessionStore } from "../session-store"
import { styles } from "./gcode-session-controls.css.js"

@customElement("gcode-session-controls")
export class GcodeSessionControls extends LitElement {
	static styles = styles

	@property({ type: String, attribute: "session-id" }) sessionId = ""
	@property({ type: String, attribute: "runtime-id" }) runtimeId = ""
	@property({ type: Boolean }) compact = false
	@state() private runtimes: SessionRuntimeDescriptor[] = []

	connectedCallback(): void {
		super.connectedCallback()
		void this.loadRuntimes()
	}

	private async loadRuntimes(): Promise<void> {
		const bridge = window.gcode?.agentSession
		if (!bridge) return
		try {
			this.runtimes = await bridge.describeRuntimes()
		} catch {
			this.runtimes = []
		}
	}

	private patch(patch: { model?: string; effort?: string; sandbox?: string }): void {
		if (!this.sessionId) return
		sessionStore.updateMeta(this.sessionId, patch)
		this.requestUpdate()
	}

	private async switchRuntime(runtimeId: string): Promise<void> {
		if (!this.sessionId || runtimeId === this.runtimeId) return
		await switchLitRuntime(this.sessionId, runtimeId)
		this.runtimeId = runtimeId
	}

	render() {
		const runtime = this.runtimes.find((item) => item.id === this.runtimeId)
		if (!runtime?.installed) return null
		const meta = sessionStore.getMeta(this.sessionId)
		const selectedModel = runtime.models.find((model) => model.slug === meta?.model) || runtime.models[0]
		const efforts = selectedModel?.efforts || []
		return html`
			<div class="controls" aria-label="Session configuration">
				<select
					aria-label="Session runtime"
					.value=${this.runtimeId}
					@change=${(event: Event) => {
						void this.switchRuntime((event.target as HTMLSelectElement).value)
					}}
				>
					${this.runtimes
						.filter((item) => item.installed)
						.map(
							(item) =>
								html`<option value=${item.id} ?selected=${item.id === this.runtimeId}>
									${item.displayName}
								</option>`,
						)}
				</select>
				${
					runtime.models.length > 0
						? html`<select
							aria-label="Model"
							.value=${selectedModel?.slug || ""}
							@change=${(event: Event) => this.patch({ model: (event.target as HTMLSelectElement).value })}
						>
							${runtime.models.map(
								(model) =>
									html`<option value=${model.slug} ?selected=${model.slug === selectedModel?.slug}>
										${model.label}
									</option>`,
							)}
						</select>`
						: null
				}
				${
					runtime.capabilities.sandboxModes
						? html`<select
							aria-label="Sandbox mode"
							.value=${meta?.sandbox || "read-only"}
							@change=${(event: Event) => this.patch({ sandbox: (event.target as HTMLSelectElement).value })}
						>
							<option value="plan" ?selected=${meta?.sandbox === "plan"}>Plan</option>
							<option value="read-only" ?selected=${(meta?.sandbox || "read-only") === "read-only"}>Read only</option>
							<option value="workspace-write" ?selected=${(meta?.sandbox || "read-only") === "workspace-write"}>Workspace write</option>
							<option value="danger-full-access" ?selected=${meta?.sandbox === "danger-full-access"}>Full access</option>
						</select>`
						: null
				}
				${
					efforts.length > 0
						? html`<select
							aria-label="Reasoning effort"
							.value=${meta?.effort || selectedModel?.defaultEffort || efforts[0] || ""}
							@change=${(event: Event) => this.patch({ effort: (event.target as HTMLSelectElement).value })}
						>
							${efforts.map(
								(effort) =>
									html`<option value=${effort} ?selected=${effort === (meta?.effort || selectedModel?.defaultEffort || efforts[0])}>
										${effort.charAt(0).toUpperCase() + effort.slice(1)}
									</option>`,
							)}
						</select>`
						: null
				}
			</div>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"gcode-session-controls": GcodeSessionControls
	}
}
