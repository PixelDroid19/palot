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
import {
	DEFAULT_SESSION_RUNTIME_ID,
	PROJECT_RUNTIME_ID,
	type SessionRuntimeId,
} from "../../lib/session-runtimes"
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
	runtimeSwitchCurrent: string
	toolbarProps: RuntimeConfigToolbarProps
	persistedSelection: RuntimeSelectionPersistence | null
	sendOptions: RuntimePromptOptions
}

function buildProjectRuntimeToolbarSections(args: {
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
		projectModel: {
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

function buildChatRuntimeConfig(args: {
	runtimeId: SessionRuntimeId
	toolbarProps: RuntimeConfigToolbarProps
	persistedSelection: RuntimeSelectionPersistence | null
	sendOptions: RuntimePromptOptions
}): ChatRuntimeConfig {
	return {
		runtimeSwitchCurrent: args.runtimeId,
		toolbarProps: args.toolbarProps,
		persistedSelection: args.persistedSelection,
		sendOptions: args.sendOptions,
	}
}

export function buildCliNewChatRuntimeConfig(args: {
	runtimeId: Exclude<SessionRuntimeId, typeof PROJECT_RUNTIME_ID>
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

export function buildProjectRuntimeNewChatRuntimeConfig(args: {
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
		runtimeId: DEFAULT_SESSION_RUNTIME_ID,
		toolbarProps: {
			sections: buildProjectRuntimeToolbarSections(args),
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
	return buildChatRuntimeConfig({
		runtimeId: args.runtimeId,
		toolbarProps: {
			sessionId: args.sessionId,
		},
		persistedSelection: null,
		sendOptions: {
			runtime: "cli",
		},
	})
}

export function buildProjectRuntimeChatRuntimeConfig(args: {
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
	return buildChatRuntimeConfig({
		runtimeId: DEFAULT_SESSION_RUNTIME_ID,
		toolbarProps: {
			sections: buildProjectRuntimeToolbarSections(args),
		},
		persistedSelection: args.persistedSelection,
		sendOptions: args.sendOptions,
	})
}
