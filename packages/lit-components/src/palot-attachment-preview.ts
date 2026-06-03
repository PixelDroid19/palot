import { html, LitElement } from "lit"
import { customElement, property } from "lit/decorators.js"
import { styles } from "./palot-attachment-preview.css.js"

export interface PalotAttachmentRemovedDetail {
	path: string
}

/**
 * palot-attachment-preview
 *
 * Compact preview for prompt attachments (files, images).
 * Shows name or thumb, remove button emits palot-attachment-removed (bubbles composed).
 * Pure, no network.
 */
@customElement("palot-attachment-preview")
export class PalotAttachmentPreview extends LitElement {
	static styles = styles

	@property({ type: String })
	path = ""

	@property({ type: String })
	mediaType = ""

	@property({ type: Boolean })
	removable = true

	protected emitRemoved = () => {
		if (!this.path) return
		this.dispatchEvent(
			new CustomEvent<PalotAttachmentRemovedDetail>("palot-attachment-removed", {
				bubbles: true,
				composed: true,
				detail: { path: this.path },
			}),
		)
	}

	render() {
		const name = this.path.split("/").pop() || this.path
		const isImage = this.mediaType.startsWith("image/")
		return html`
			<div class="preview" role="group" aria-label=${name}>
				<span class="icon" aria-hidden="true">${isImage ? "🖼" : "📄"}</span>
				<span class="name">${name}</span>
				${
					this.removable
						? html`<button type="button" aria-label="Remove attachment" @click=${this.emitRemoved}>×</button>`
						: null
				}
			</div>
		`
	}
}

// Side-effect registration (guarded for test multi-import + hot reload).
if (!customElements.get("palot-attachment-preview")) {
	customElements.define("palot-attachment-preview", PalotAttachmentPreview)
}

declare global {
	interface HTMLElementTagNameMap {
		"palot-attachment-preview": PalotAttachmentPreview
	}
}
