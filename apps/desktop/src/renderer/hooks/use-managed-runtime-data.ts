/**
 * Compatibility shim: legacy imports still resolve here, but the neutral
 * project-runtime surface lives in `use-project-runtime-data`.
 */
export * from "./use-project-runtime-data"
export {
	useProjectRuntimeAgents as useManagedRuntimeAgents,
	useProjectRuntimeCommands as useManagedRuntimeCommands,
	useProjectRuntimeConfig as useManagedRuntimeConfig,
	useProjectRuntimeModelState as useManagedRuntimeModelState,
	useProjectRuntimeProviders as useManagedRuntimeProviders,
	useProjectRuntimeVcs as useManagedRuntimeVcs,
} from "./use-project-runtime-data"
