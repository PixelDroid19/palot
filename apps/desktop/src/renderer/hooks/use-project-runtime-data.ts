import {
	getModelDisplayName,
	getModelInputCapabilities,
	getModelVariants,
	parseModelRef,
	resolveEffectiveModel,
	useConfig,
	useProjectRuntimeAgents as useProjectRuntimeAgentsSource,
	useModelState,
	useProviders,
	useServerCommands,
	useVcs,
	useAllProviders,
	useConnectedProviders,
	useProviderAuthMethods,
	queryKeys,
	type CatalogProvider,
	type ConnectedProviderInfo,
	type ConfigData,
	type CompactionConfig,
	type ModelRef,
	type ProvidersData,
	type SdkAgent,
	type SdkCommand,
	type SdkConfig,
	type SdkModel,
	type SdkProvider,
	type SdkProviderAuthMethod,
	type VcsData,
} from "./project-runtime-data-source"

export type {
	CatalogProvider,
	ConnectedProviderInfo,
	ConfigData,
	CompactionConfig,
	ModelRef,
	ProvidersData,
	SdkAgent,
	SdkCommand,
	SdkConfig,
	SdkModel,
	SdkProvider,
	SdkProviderAuthMethod,
	VcsData,
}

export {
	getModelDisplayName,
	getModelInputCapabilities,
	getModelVariants,
	parseModelRef,
	queryKeys,
	resolveEffectiveModel,
	useAllProviders,
	useConnectedProviders,
	useProviderAuthMethods,
}

export const useRuntimeConfig = useConfig
export const useRuntimeProviders = useProviders
export const useRuntimeAgents = useProjectRuntimeAgentsSource
export const useRuntimeCommands = useServerCommands
export const useRuntimeVcs = useVcs
export const useRuntimeModelState = useModelState

export const useProjectRuntimeConfig = useRuntimeConfig
export const useProjectRuntimeProviders = useRuntimeProviders
export const useProjectRuntimeAgents = useRuntimeAgents
export const useProjectRuntimeCommands = useRuntimeCommands
export const useProjectRuntimeVcs = useRuntimeVcs
export const useProjectRuntimeModelState = useRuntimeModelState
/** @deprecated Prefer useRuntime* names */
export const useManagedRuntimeConfig = useRuntimeConfig
/** @deprecated Prefer useRuntime* names */
export const useManagedRuntimeProviders = useRuntimeProviders
/** @deprecated Prefer useRuntime* names */
export const useManagedRuntimeAgents = useRuntimeAgents
/** @deprecated Prefer useRuntime* names */
export const useManagedRuntimeCommands = useRuntimeCommands
/** @deprecated Prefer useRuntime* names */
export const useManagedRuntimeVcs = useRuntimeVcs
/** @deprecated Prefer useRuntime* names */
export const useManagedRuntimeModelState = useRuntimeModelState

export function useRuntimeSessionData(args: {
	configDirectory: string | null
	workspaceDirectory: string | null
}) {
	return {
		providers: useRuntimeProviders(args.configDirectory),
		config: useRuntimeConfig(args.configDirectory),
		agents: useRuntimeAgents(args.configDirectory),
		vcs: useRuntimeVcs(args.workspaceDirectory),
		modelState: useRuntimeModelState(),
	}
}

export const useProjectRuntimeSessionData = useRuntimeSessionData
