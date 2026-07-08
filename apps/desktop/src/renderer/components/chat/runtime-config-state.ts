import type { AgentRuntimeDescriptor, AgentSandbox } from "../../../preload/api"
import {
	getModelVariants,
	type ModelRef,
	type ProvidersData,
	type SdkAgent,
} from "../../hooks/use-project-runtime-data"
import type {
	ProjectRuntimePromptOptions,
	ProjectRuntimeSelection,
	RuntimePromptOptions,
	RuntimeSelectionPersistence,
} from "../../lib/runtime-session-config"
import type { SessionRuntimeId } from "../../lib/session-runtimes"
import type {
	RuntimeConfigToolbarProps,
	RuntimeToolbarSections,
} from "./runtime-config-toolbar"

export interface NewChatRuntimeConfig {
	runtimeId: SessionRuntimeId
	toolbarProps: RuntimeConfigToolbarProps
	launch: {
		cli?: {
			sandbox: AgentSandbox
			model?: string
			effort?: string
		}
		project?: {
			worktreeMode: "local" | "worktree"
			promptOptions: ProjectRuntimePromptOptions
		}
	}
}

export interface ChatRuntimeConfig {
	kind: "cli-session" | "managed"
	runtimeSwitchCurrent: string
	toolbarProps: RuntimeConfigToolbarProps
	persistedSelection: RuntimeSelectionPersistence | null
	sendOptions: RuntimePromptOptions
}

function buildManagedRuntimeToolbarSections(args: {
	agents: SdkAgent[]
	selectedAgent: string | null
	defaultAgent?: string
	onSelectAgent: (agentName: string) => void
	providers: ProvidersData | null
	effectiveModel: ModelRef | null
	hasModelOverride: boolean
	onSelectModel: (model: ModelRef | null) => void
	recentModels?: ModelRef[]
	selectedVariant: string | undefined
	onSelectVariant: (variant: string | undefined) => void
	disabled?: boolean
}): RuntimeToolbarSections {
	const variants =
		args.effectiveModel && args.providers
			? getModelVariants(
					args.effectiveModel.providerID,
					args.effectiveModel.modelID,
					args.providers.providers,
				)
			: []

	return {
		agent: {
			agents: args.agents,
			selectedAgent: args.selectedAgent,
			defaultAgent: args.defaultAgent,
			onSelectAgent: args.onSelectAgent,
			disabled: args.disabled,
		},
		managedModel: {
			providers: args.providers,
			effectiveModel: args.effectiveModel,
			hasOverride: args.hasModelOverride,
			onSelectModel: args.onSelectModel,
			recentModels: args.recentModels,
			disabled: args.disabled,
		},
		variant: variants.length
			? {
					variants,
					selectedVariant: args.selectedVariant,
					onSelectVariant: args.onSelectVariant,
					disabled: args.disabled,
				}
			: undefined,
	}
}

export function buildCliNewChatRuntimeConfig(args: {
	runtimeId: Exclude<SessionRuntimeId, "opencode">
	models: AgentRuntimeDescriptor["models"]
	modelValue: string
	onModelChange: (value: string) => void
	sandboxValue: AgentSandbox
	onSandboxChange: (value: AgentSandbox) => void
	efforts: string[]
	effortValue: string
	onEffortChange: (value: string) => void
	model?: string
	effort?: string
	sandbox: AgentSandbox
}): NewChatRuntimeConfig {
	return {
		runtimeId: args.runtimeId,
		toolbarProps: {
			sections: {
				cliModel: {
					models: args.models,
					value: args.modelValue,
					onValueChange: args.onModelChange,
				},
				sandbox: {
					value: args.sandboxValue,
					onValueChange: args.onSandboxChange,
				},
				effort: args.efforts.length
					? {
							efforts: args.efforts,
							value: args.effortValue,
							onValueChange: args.onEffortChange,
						}
					: undefined,
			},
		},
		launch: {
			cli: {
				model: args.model,
				effort: args.effort,
				sandbox: args.sandbox,
			},
		},
	}
}

export function buildManagedRuntimeNewChatRuntimeConfig(args: {
	agents: SdkAgent[]
	selectedAgent: string | null
	defaultAgent?: string
	onSelectAgent: (agentName: string) => void
	providers: ProvidersData | null
	effectiveModel: ModelRef | null
	hasModelOverride: boolean
	onSelectModel: (model: ModelRef | null) => void
	recentModels?: ModelRef[]
	selectedVariant: string | undefined
	onSelectVariant: (variant: string | undefined) => void
	worktreeMode: "local" | "worktree"
}): NewChatRuntimeConfig {
	return {
		runtimeId: "opencode",
		toolbarProps: {
			sections: buildManagedRuntimeToolbarSections(args),
		},
		launch: {
			project: {
				worktreeMode: args.worktreeMode,
				promptOptions: {
					model: args.effectiveModel ?? undefined,
					agentName: args.selectedAgent ?? undefined,
					variant: args.selectedVariant,
				},
			},
		},
	}
}

export function buildCliChatRuntimeConfig(args: {
	sessionId: string
	runtimeId: string
}): ChatRuntimeConfig {
	return {
		kind: "cli-session",
		runtimeSwitchCurrent: args.runtimeId,
		toolbarProps: {
			sessionId: args.sessionId,
		},
		persistedSelection: null,
		sendOptions: {
			runtime: "cli",
		},
	}
}

export function buildManagedRuntimeChatRuntimeConfig(args: {
	agents: SdkAgent[]
	selectedAgent: string | null
	defaultAgent?: string
	onSelectAgent: (agentName: string) => void
	providers: ProvidersData | null
	effectiveModel: ModelRef | null
	hasModelOverride: boolean
	onSelectModel: (model: ModelRef | null) => void
	recentModels?: ModelRef[]
	selectedVariant: string | undefined
	onSelectVariant: (variant: string | undefined) => void
	disabled?: boolean
	persistedSelection: ProjectRuntimeSelection | null
	sendOptions: ProjectRuntimePromptOptions
}): ChatRuntimeConfig {
	return {
		kind: "managed",
		runtimeSwitchCurrent: "opencode",
		toolbarProps: {
			sections: buildManagedRuntimeToolbarSections(args),
		},
		persistedSelection: args.persistedSelection,
		sendOptions: args.sendOptions,
	}
}
