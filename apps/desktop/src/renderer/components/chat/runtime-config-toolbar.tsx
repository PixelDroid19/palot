import type { AgentRuntimeDescriptor, AgentSandbox } from "../../../preload/api"
import { useEffect, useState } from "react"
import {
	availableRuntimeModels,
	getRuntimeModelEfforts,
	resolveRuntimeEffort,
	resolveRuntimeModel,
} from "../../lib/runtime-model-selection"
import {
	patchSessionRuntimeState,
	useSessionRuntimeState,
} from "../../lib/runtime-session-config"
import { loadRuntimeDescriptors } from "../../lib/session-runtimes"
import { CliPromptToolbar } from "./cli-toolbar"
import { type PromptToolbarProps, PromptToolbar } from "./prompt-toolbar"

interface CliRuntimeConfigToolbarProps {
	kind: "cli"
	models: AgentRuntimeDescriptor["models"]
	modelValue: string
	onModelChange: (value: string) => void
	sandboxValue: AgentSandbox
	onSandboxChange: (value: AgentSandbox) => void
	efforts: string[]
	effortValue: string
	onEffortChange: (value: string) => void
}

interface OpenCodeRuntimeConfigToolbarProps extends PromptToolbarProps {
	kind: "opencode"
}

interface CliSessionRuntimeConfigToolbarProps {
	kind: "cli-session"
	sessionId: string
}

export type RuntimeConfigToolbarProps =
	| CliRuntimeConfigToolbarProps
	| CliSessionRuntimeConfigToolbarProps
	| OpenCodeRuntimeConfigToolbarProps

export function RuntimeConfigToolbar(props: RuntimeConfigToolbarProps) {
	if (props.kind === "cli-session") {
		return <CliSessionRuntimeConfigToolbar sessionId={props.sessionId} />
	}

	if (props.kind === "cli") {
		return (
			<CliPromptToolbar
				models={props.models}
				modelValue={props.modelValue}
				onModelChange={props.onModelChange}
				sandboxValue={props.sandboxValue}
				onSandboxChange={props.onSandboxChange}
				efforts={props.efforts}
				effortValue={props.effortValue}
				onEffortChange={props.onEffortChange}
			/>
		)
	}

	return (
		<PromptToolbar
			agents={props.agents}
			selectedAgent={props.selectedAgent}
			defaultAgent={props.defaultAgent}
			onSelectAgent={props.onSelectAgent}
			providers={props.providers}
			effectiveModel={props.effectiveModel}
			hasModelOverride={props.hasModelOverride}
			onSelectModel={props.onSelectModel}
			recentModels={props.recentModels}
			selectedVariant={props.selectedVariant}
			onSelectVariant={props.onSelectVariant}
			disabled={props.disabled}
		/>
	)
}

function CliSessionRuntimeConfigToolbar({ sessionId }: { sessionId: string }) {
	const runtimeState = useSessionRuntimeState(sessionId)
	const meta = runtimeState.runtime === "cli" ? runtimeState.meta : null
	const [runtimes, setRuntimes] = useState<AgentRuntimeDescriptor[]>([])

	const runtimeId = meta?.runtimeId
	useEffect(() => {
		if (!runtimeId) return
		loadRuntimeDescriptors().then((all) => setRuntimes(all.filter((d) => d.installed)))
	}, [runtimeId])

	const descriptor = runtimes.find((d) => d.id === runtimeId)
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

	return (
		<RuntimeConfigToolbar
			kind="cli"
			models={models}
			modelValue={currentSlug}
			onModelChange={(value) => apply({ model: value, effort: "" })}
			sandboxValue={meta.sandbox}
			onSandboxChange={(value) => apply({ sandbox: value })}
			efforts={descriptor.capabilities.reasoningEffort ? efforts : []}
			effortValue={currentEffort}
			onEffortChange={(value) => apply({ effort: value })}
		/>
	)
}
