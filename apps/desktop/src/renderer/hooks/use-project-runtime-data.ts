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
	resolveEffectiveModel,
}

export const useProjectRuntimeConfig = useConfig
export const useProjectRuntimeProviders = useProviders
export const useProjectRuntimeAgents = useProjectRuntimeAgentsSource
export const useProjectRuntimeCommands = useServerCommands
export const useProjectRuntimeVcs = useVcs
export const useProjectRuntimeModelState = useModelState
export const useManagedRuntimeConfig = useProjectRuntimeConfig
export const useManagedRuntimeProviders = useProjectRuntimeProviders
export const useManagedRuntimeAgents = useProjectRuntimeAgents
export const useManagedRuntimeCommands = useProjectRuntimeCommands
export const useManagedRuntimeVcs = useProjectRuntimeVcs
export const useManagedRuntimeModelState = useProjectRuntimeModelState

export function useProjectRuntimeSessionData(args: {
	configDirectory: string | null
	workspaceDirectory: string | null
}) {
	return {
		providers: useProjectRuntimeProviders(args.configDirectory),
		config: useProjectRuntimeConfig(args.configDirectory),
		agents: useProjectRuntimeAgents(args.configDirectory),
		vcs: useProjectRuntimeVcs(args.workspaceDirectory),
		modelState: useProjectRuntimeModelState(),
	}
}
