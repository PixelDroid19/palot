import type {
	AgentRuntimeDescriptor,
	AgentSandbox,
	SessionRuntimeDescriptor,
} from "../../../preload/api"
import { useEffect, useState } from "react"
import {
	getModelVariants,
	parseModelRef,
	type ModelRef,
	type ProvidersData,
	type SdkAgent,
} from "../../hooks/use-runtime-data"
import {
	availableRuntimeModels,
	getRuntimeModelEfforts,
	resolveRuntimeEffort,
	resolveRuntimeModel,
} from "../../lib/runtime-model-selection"
import type {
	ConfigurableRuntimeSelection,
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
	installedProcessRuntimeDescriptors,
	loadRuntimeDescriptors,
	type SessionRuntimeId,
} from "../../lib/session-runtimes"
import type {
	RuntimeConfigToolbarProps,
	RuntimeToolbarSections,
} from "./runtime-config-toolbar"
import type { RuntimeModelSelectItem } from "./runtime-model-select"
import { buildProcessToolbarSectionsFromCatalog } from "./runtime-toolbar-sections"

export interface NewChatRuntimeConfig {
	runtimeId: SessionRuntimeId
	toolbarProps: RuntimeConfigToolbarProps
	launch: {
		create: {
			sandbox: AgentSandbox
			model?: string
			effort?: string
		}
		promptOptions?: RuntimePromptOptions
		worktreeMode?: "local" | "worktree"
	}
}

export interface ChatRuntimeConfig {
	runtimeSwitchCurrent: string
	toolbarProps: RuntimeConfigToolbarProps
	persistedSelection: RuntimeSelectionPersistence | null
	sendOptions: RuntimePromptOptions
}

interface ConfigurableRuntimeModelOption {
	value: string
	providerID: string
	modelID: string
	displayName: string
	providerName: string
	reasoning: boolean
}

function flattenConfigurableRuntimeModels(providers: ProvidersData | null): ConfigurableRuntimeModelOption[] {
	if (!providers) return []
	const models: ConfigurableRuntimeModelOption[] = []
	for (const provider of providers.providers) {
		for (const [key, model] of Object.entries(provider.models)) {
			models.push({
				value: `${provider.id}/${key}`,
				providerID: provider.id,
				modelID: key,
				displayName: model.name,
				providerName: provider.name,
				reasoning: model.capabilities?.reasoning ?? false,
			})
		}
	}
	return models
}

function buildConfigurableRuntimeModelItems(args: {
	providers: ProvidersData | null
	recentModels?: ModelRef[]
}): RuntimeModelSelectItem[] {
	const models = flattenConfigurableRuntimeModels(args.providers)
	const modelItems = models.map((model) => ({
		value: model.value,
		label: model.displayName,
		group: model.providerName,
		description: model.providerName,
		searchTerms: [model.providerName, model.modelID, model.displayName],
		badge: model.reasoning ? "reasoning" : undefined,
		provider: {
			id: model.providerID,
			name: model.providerName,
		},
	}))
	if (!args.recentModels?.length) return modelItems

	const recent = args.recentModels
		.slice(0, 3)
		.map((ref) => models.find((model) => model.providerID === ref.providerID && model.modelID === ref.modelID))
		.filter((model): model is ConfigurableRuntimeModelOption => model != null)
		.map((model) => ({
			value: model.value,
			label: model.displayName,
			group: "Last used",
			description: model.providerName,
			searchTerms: [model.providerName, model.modelID, model.displayName],
			badge: model.reasoning ? "reasoning" : undefined,
			provider: {
				id: model.providerID,
				name: model.providerName,
			},
		}))

	return [...recent, ...modelItems]
}

function buildConfigurableRuntimeToolbarSections(args: {
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
		model: {
			items: buildConfigurableRuntimeModelItems({
				providers: args.providers,
				recentModels: args.recentModels,
			}),
			value: args.effectiveModel
				? `${args.effectiveModel.providerID}/${args.effectiveModel.modelID}`
				: null,
			onValueChange: (value) => {
				args.onSelectModel(parseModelRef(value))
			},
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

/**
 * Process-adapter (agent-host) toolbar sections: model · sandbox · effort.
 * Same slot grammar as managed-server; only populated slots differ by capability.
 */
export function buildProcessRuntimeToolbarSections(args: {
	models: AgentRuntimeDescriptor["models"]
	modelValue: string | null
	onModelChange: (value: string) => void
	sandboxValue: AgentSandbox
	onSandboxChange: (value: AgentSandbox) => void
	efforts: string[]
	effortValue: string
	onEffortChange: (value: string) => void
}): RuntimeToolbarSections {
	return buildProcessToolbarSectionsFromCatalog(args) as RuntimeToolbarSections
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

export function buildProcessNewChatRuntimeConfig(args: {
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
			sections: buildProcessRuntimeToolbarSections({
				models: args.models,
				modelValue: args.modelValue || null,
				onModelChange: args.onModelChange,
				sandboxValue: args.sandboxValue,
				onSandboxChange: args.onSandboxChange,
				efforts: args.efforts,
				effortValue: args.effortValue,
				onEffortChange: args.onEffortChange,
			}),
		},
		launch: {
			create: {
				model: args.model,
				effort: args.effort,
				sandbox: args.sandbox,
			},
			promptOptions: {
				runtimeId: args.runtimeId,
				modelSlug: args.model,
				effort: args.effort,
				permissionMode: args.sandbox,
			},
		},
	}
}

/** @deprecated Use {@link buildProcessNewChatRuntimeConfig} */
export const buildCliNewChatRuntimeConfig = buildProcessNewChatRuntimeConfig

export function buildConfigurableRuntimeNewChatRuntimeConfig(args: {
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
			sections: buildConfigurableRuntimeToolbarSections(args),
		},
		launch: {
			create: {
				sandbox: "read-only",
			},
			worktreeMode: args.worktreeMode,
			promptOptions: {
				model: args.effectiveModel ?? undefined,
				agentName: args.selectedAgent ?? undefined,
				variant: args.selectedVariant,
			},
		},
	}
}

export function buildProcessChatRuntimeConfig(args: {
	runtimeId: string
	toolbarProps: RuntimeConfigToolbarProps
	/** Optional per-send overrides from session meta (model/effort/sandbox). */
	sendOptions?: RuntimePromptOptions
}): ChatRuntimeConfig {
	return buildChatRuntimeConfig({
		runtimeId: args.runtimeId,
		toolbarProps: args.toolbarProps,
		persistedSelection: null,
		sendOptions: {
			runtimeId: args.runtimeId,
			...args.sendOptions,
		},
	})
}

/** @deprecated Use {@link buildProcessChatRuntimeConfig} */
export const buildCliChatRuntimeConfig = buildProcessChatRuntimeConfig

export function buildConfigurableRuntimeChatRuntimeConfig(args: {
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
	persistedSelection: ConfigurableRuntimeSelection | null
	sendOptions: RuntimePromptOptions
}): ChatRuntimeConfig {
	return buildChatRuntimeConfig({
		runtimeId: DEFAULT_SESSION_RUNTIME_ID,
		toolbarProps: {
			sections: buildConfigurableRuntimeToolbarSections(args),
		},
		persistedSelection: args.persistedSelection,
		sendOptions: args.sendOptions,
	})
}

/** Process-adapter session toolbar (Codex/Claude catalogs → shared slots). */
export function useProcessChatRuntimeToolbarProps(
	sessionId: string,
): RuntimeConfigToolbarProps | null {
	const runtimeState = useSessionRuntimeState(sessionId)
	const meta = cliRuntimeMeta(runtimeState)
	const [runtimes, setRuntimes] = useState<SessionRuntimeDescriptor[]>([])

	const runtimeId = meta?.runtimeId
	useEffect(() => {
		if (!runtimeId) return
		loadRuntimeDescriptors().then((all) => setRuntimes(installedProcessRuntimeDescriptors(all)))
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
		sections: buildProcessRuntimeToolbarSections({
			models,
			modelValue: currentSlug || null,
			onModelChange: (value) => apply({ model: value, effort: "" }),
			sandboxValue: meta.sandbox,
			onSandboxChange: (value) => apply({ sandbox: value }),
			efforts,
			effortValue: currentEffort,
			onEffortChange: (value) => apply({ effort: value }),
		}),
	}
}

/** @deprecated Use {@link useProcessChatRuntimeToolbarProps} */
export const useCliChatRuntimeToolbarProps = useProcessChatRuntimeToolbarProps
