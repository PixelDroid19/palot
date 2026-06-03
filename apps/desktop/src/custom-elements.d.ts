// Augment JSX for Palot Lit web components (hosted in React during migration).
// Keep in sync with packages/lit-components/src/* (properties + events).
// See @palot/lit-components and roadmap/lit-migration.md.
declare global {
	namespace JSX {
		interface IntrinsicElements {
			"palot-session-row": React.DetailedHTMLProps<
				React.HTMLAttributes<HTMLElement> & {
					"session-id"?: string
					title?: string
					status?: string
					active?: boolean
				},
				HTMLElement
			>
			"palot-project-row": React.DetailedHTMLProps<
				React.HTMLAttributes<HTMLElement> & {
					name?: string
					"agent-count"?: number
				},
				HTMLElement
			>
			"palot-status-badge": React.DetailedHTMLProps<
				React.HTMLAttributes<HTMLElement> & {
					status?: string
					label?: string
				},
				HTMLElement
			>
			"palot-automation-row": React.DetailedHTMLProps<
				React.HTMLAttributes<HTMLElement> & {
					"automation-id"?: string
					status?: string
					title?: string
				},
				HTMLElement
			>
			// Add more palot-* (permission-item, question-item, etc.) as used in JSX.
		}
	}
}

export {}
