import type {
	AgentRuntimeDescriptor,
	AgentSandbox,
	SessionRuntimeDescriptor,
} from "../../../preload/api"
import { useEffect, useState } from "react"
import {
	getModelVariants,
	type ModelRef,
	type ProvidersData,
	type SdkAgent,
} from "../../hooks/use-project-runtime-data"
import {
	availableRuntimeModels,
	getRuntimeModelEfforts,
	resolveRuntimeEffort,
	resolveRuntimeModel,
} from "../../lib/runtime-model-selection"
import type {
	ProjectRuntimePromptOptions,
	ProjectRuntimeSelection,
	RuntimePromptOptions,
	RuntimeSelectionPersistence,
} from "../../lib/runtime-session-config"
import {
	cliRuntimeMeta,
	patchSessionRuntimeState,
	useSessionRuntimeState,
} from "../../lib/runtime-session-config"
import {
	DEFAULT_SESSION_RUNTIME_ID,
	PROJECT_RUNTIME_ID,
	installedCliRuntimeDescriptors,
	loadRuntimeDescriptors,
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

function buildCliRuntimeToolbarSections(args: {
	models: AgentRuntimeDescriptor["models"]
	modelValue: string
	onModelChange: (value: string) => void
	sandboxValue: AgentSandbox
	onSandboxChange: (value: AgentSandbox) => void
	efforts: string[]
	effortValue: string
	onEffortChange: (value: string) => void
}): RuntimeToolbarSections {
	return {
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
			sections: buildCliRuntimeToolbarSections({
				models: args.models,
				modelValue: args.modelValue,
				onModelChange: args.onModelChange,
				sandboxValue: args.sandboxValue,
				onSandboxChange: args.onSandboxChange,
				efforts: args.efforts,
				effortValue: args.effortValue,
				onEffortChange: args.onEffortChange,
			}),
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
	runtimeId: string
	toolbarProps: RuntimeConfigToolbarProps
}): ChatRuntimeConfig {
	return buildChatRuntimeConfig({
		runtimeId: args.runtimeId,
		toolbarProps: args.toolbarProps,
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

export function useCliChatRuntimeToolbarProps(
	sessionId: string,
): RuntimeConfigToolbarProps | null {
	const runtimeState = useSessionRuntimeState(sessionId)
	const meta = cliRuntimeMeta(runtimeState)
	const [runtimes, setRuntimes] = useState<SessionRuntimeDescriptor[]>([])

	const runtimeId = meta?.runtimeId
	useEffect(() => {
		if (!runtimeId) return
		loadRuntimeDescriptors().then((all) => setRuntimes(installedCliRuntimeDescriptors(all)))
	}, [runtimeId])

	const descriptor = runtimes.find((runtime) => runtime.id === runtimeId)
	const models = descriptor ? availableRuntimeModels(descriptor) : []
	const currentSlug = descriptor ? (resolveRuntimeModel(descriptor, meta?.model) ?? "") : ""
	const currentEffort = descriptor
		? (resolveRuntimeEffort(descriptor, currentSlug, meta?.effort) ?? "")
		: ""
	const efforts = descriptor ? getRuntimeModelEfforts(descriptor, currentSlug) : []

	useEffect(() => {
		if (!meta || !descriptor) return
		const normalizedModel = currentSlug || undefined
		const normalizedEffort = currentEffort || undefined
		if (meta.model === normalizedModel && meta.effort === normalizedEffort) return
		patchSessionRuntimeState(sessionId, {
			model: normalizedModel,
			effort: normalizedEffort,
		})
	}, [currentEffort, currentSlug, descriptor, meta, sessionId])

	if (!meta || !descriptor) return null

	const apply = (patch: { model?: string; effort?: string; sandbox?: AgentSandbox }) => {
		const nextModel = resolveRuntimeModel(descriptor, patch.model ?? meta.model)
		const nextEffort = resolveRuntimeEffort(descriptor, nextModel, patch.effort ?? meta.effort)
		patchSessionRuntimeState(sessionId, {
			model: nextModel,
			effort: nextEffort,
			sandbox: patch.sandbox ?? meta.sandbox,
		})
	}

	return {
		sections: buildCliRuntimeToolbarSections({
			models,
			modelValue: currentSlug,
			onModelChange: (value) => apply({ model: value, effort: "" }),
			sandboxValue: meta.sandbox,
			onSandboxChange: (value) => apply({ sandbox: value }),
			efforts,
			effortValue: currentEffort,
			onEffortChange: (value) => apply({ effort: value }),
		}),
	}
}
