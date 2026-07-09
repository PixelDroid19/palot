/**
 * Pure capability → toolbar slot mapping. No React — safe for unit tests.
 * Visual chrome lives in runtime-config-toolbar.tsx and consumes these sections.
 */

export interface RuntimeToolbarModelItem {
	value: string
	label: string
	group?: string
	description?: string
	searchTerms?: string[]
	badge?: string
	provider?: { id: string; name: string }
}

export interface RuntimeToolbarAgentSection<TAgent = unknown> {
	agents: TAgent[]
	selectedAgent: string | null
	defaultAgent?: string
	onSelectAgent: (agentName: string) => void
	disabled?: boolean
}

export interface RuntimeToolbarModelSection {
	items: RuntimeToolbarModelItem[]
	value: string | null
	onValueChange: (value: string) => void
	disabled?: boolean
	/** Explicit empty-state label when discovery returned a fallback catalog. */
	emptyLabel?: string
}

export interface RuntimeToolbarVariantSection {
	variants: string[]
	selectedVariant: string | undefined
	onSelectVariant: (variant: string | undefined) => void
	disabled?: boolean
}

export interface RuntimeToolbarSandboxSection<TSandbox = string> {
	value: TSandbox
	onValueChange: (value: TSandbox) => void
	disabled?: boolean
}

export interface RuntimeToolbarEffortSection {
	efforts: string[]
	value: string
	onValueChange: (value: string) => void
	disabled?: boolean
}

/**
 * Ordered slots shared by every runtime. Only include keys the descriptor
 * declares; the view skips undefined slots.
 */
export interface RuntimeToolbarSections<TAgent = unknown, TSandbox = string> {
	agent?: RuntimeToolbarAgentSection<TAgent>
	model?: RuntimeToolbarModelSection
	variant?: RuntimeToolbarVariantSection
	sandbox?: RuntimeToolbarSandboxSection<TSandbox>
	effort?: RuntimeToolbarEffortSection
}

/**
 * Pure section builder: same slot order/grammar for all runtimes.
 * Missing / empty capability data ⇒ slot omitted (no broken selectors).
 */
export function buildToolbarSectionsFromSlots<TAgent, TSandbox>(
	sections: RuntimeToolbarSections<TAgent, TSandbox>,
): RuntimeToolbarSections<TAgent, TSandbox> {
	return {
		agent: sections.agent,
		model:
			sections.model && sections.model.items.length > 0
				? sections.model
				: sections.model?.emptyLabel
					? sections.model
					: undefined,
		variant:
			sections.variant && sections.variant.variants.length > 0 ? sections.variant : undefined,
		sandbox: sections.sandbox,
		effort:
			sections.effort && sections.effort.efforts.length > 0 ? sections.effort : undefined,
	}
}
