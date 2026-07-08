import type { AgentRuntimeDescriptor, AgentSandbox } from "../../../preload/api"
import type { ModelRef, ProvidersData, SdkAgent } from "../../hooks/use-opencode-data"
import type { SessionRuntimeId } from "../../lib/session-runtimes"
import type { RuntimeConfigToolbarProps } from "./runtime-config-toolbar"

export type NewChatRuntimeConfig =
	| {
			kind: "cli"
			runtimeId: Exclude<SessionRuntimeId, "opencode">
			toolbarProps: RuntimeConfigToolbarProps
			model?: string
			effort?: string
			sandbox: AgentSandbox
	  }
	| {
			kind: "opencode"
			toolbarProps: RuntimeConfigToolbarProps
			worktreeMode: "local" | "worktree"
	  }

export type ChatRuntimeConfig =
	| {
			kind: "cli-session"
			runtimeSwitchCurrent: string
			toolbarProps: RuntimeConfigToolbarProps
	  }
	| {
			kind: "opencode"
			runtimeSwitchCurrent: "opencode"
			toolbarProps: RuntimeConfigToolbarProps
			projectModel:
				| {
						directory: string
						model: ModelRef & { variant?: string; agent?: string }
				  }
				| null
			sendOptions: {
				model?: ModelRef
				agentName?: string
				variant?: string
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
		kind: "cli",
		runtimeId: args.runtimeId,
		toolbarProps: {
			kind: "cli",
			models: args.models,
			modelValue: args.modelValue,
			onModelChange: args.onModelChange,
			sandboxValue: args.sandboxValue,
			onSandboxChange: args.onSandboxChange,
			efforts: args.efforts,
			effortValue: args.effortValue,
			onEffortChange: args.onEffortChange,
		},
		model: args.model,
		effort: args.effort,
		sandbox: args.sandbox,
	}
}

export function buildOpenCodeNewChatRuntimeConfig(args: {
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
		kind: "opencode",
		toolbarProps: {
			kind: "opencode",
			agents: args.agents,
			selectedAgent: args.selectedAgent,
			defaultAgent: args.defaultAgent,
			onSelectAgent: args.onSelectAgent,
			providers: args.providers,
			effectiveModel: args.effectiveModel,
			hasModelOverride: args.hasModelOverride,
			onSelectModel: args.onSelectModel,
			recentModels: args.recentModels,
			selectedVariant: args.selectedVariant,
			onSelectVariant: args.onSelectVariant,
		},
		worktreeMode: args.worktreeMode,
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
			kind: "cli-session",
			sessionId: args.sessionId,
		},
	}
}

export function buildOpenCodeChatRuntimeConfig(args: {
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
	projectModel:
		| {
				directory: string
				model: ModelRef & { variant?: string; agent?: string }
		  }
		| null
	sendOptions: {
		model?: ModelRef
		agentName?: string
		variant?: string
	}
}): ChatRuntimeConfig {
	return {
		kind: "opencode",
		runtimeSwitchCurrent: "opencode",
		toolbarProps: {
			kind: "opencode",
			agents: args.agents,
			selectedAgent: args.selectedAgent,
			defaultAgent: args.defaultAgent,
			onSelectAgent: args.onSelectAgent,
			providers: args.providers,
			effectiveModel: args.effectiveModel,
			hasModelOverride: args.hasModelOverride,
			onSelectModel: args.onSelectModel,
			recentModels: args.recentModels,
			selectedVariant: args.selectedVariant,
			onSelectVariant: args.onSelectVariant,
			disabled: args.disabled,
		},
		projectModel: args.projectModel,
		sendOptions: args.sendOptions,
	}
}
