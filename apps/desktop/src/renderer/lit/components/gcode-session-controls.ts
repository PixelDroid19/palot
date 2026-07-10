/** Descriptor-driven session model, effort and sandbox controls for Lit. */
import { html, LitElement } from "lit"
import { customElement, property, state } from "lit/decorators.js"
import type { SessionRuntimeDescriptor } from "../../../preload/api"
import { sessionStore } from "../session-store"
import { styles } from "./gcode-session-controls.css.js"

@customElement("gcode-session-controls")
export class GcodeSessionControls extends LitElement {
	static styles = styles

	@property({ type: String, attribute: "session-id" }) sessionId = ""
	@property({ type: String, attribute: "runtime-id" }) runtimeId = ""
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

	render() {
		const runtime = this.runtimes.find((item) => item.id === this.runtimeId)
		if (!runtime?.installed) return null
		const meta = sessionStore.getMeta(this.sessionId)
		const selectedModel = runtime.models.find((model) => model.slug === meta?.model) || runtime.models[0]
		const efforts = selectedModel?.efforts || []
		return html`
			<div class="controls" aria-label="Session configuration">
				${
					runtime.models.length > 0
						? html`<select
							aria-label="Model"
							.value=${selectedModel?.slug || ""}
							@change=${(event: Event) => this.patch({ model: (event.target as HTMLSelectElement).value })}
						>
							${runtime.models.map(
								(model) => html`<option value=${model.slug}>${model.label}</option>`,
							)}
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
							${efforts.map((effort) => html`<option value=${effort}>${effort}</option>`)}
						</select>`
						: null
				}
				${
					runtime.capabilities.sandboxModes
						? html`<select
							aria-label="Sandbox mode"
							.value=${meta?.sandbox || "workspace-write"}
							@change=${(event: Event) => this.patch({ sandbox: (event.target as HTMLSelectElement).value })}
						>
							<option value="read-only">Read only</option>
							<option value="workspace-write">Workspace write</option>
							<option value="danger-full-access">Full access</option>
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
