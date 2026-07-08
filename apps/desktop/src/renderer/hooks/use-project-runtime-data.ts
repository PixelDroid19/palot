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
export const useManagedRuntimeConfig = useRuntimeConfig
export const useManagedRuntimeProviders = useRuntimeProviders
export const useManagedRuntimeAgents = useRuntimeAgents
export const useManagedRuntimeCommands = useRuntimeCommands
export const useManagedRuntimeVcs = useRuntimeVcs
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
