import type { AgentRuntimeDescriptor, AgentSandbox, SessionRuntimeDescriptor } from "../../../preload/api"
import { useEffect, useState } from "react"
import type { ModelRef, ProvidersData, SdkAgent } from "../../hooks/use-project-runtime-data"
import { useTranslation } from "../../i18n/use-translation"
import {
	availableRuntimeModels,
	getRuntimeModelEfforts,
	resolveRuntimeEffort,
	resolveRuntimeModel,
} from "../../lib/runtime-model-selection"
import {
	cliRuntimeMeta,
	patchSessionRuntimeState,
	useSessionRuntimeState,
} from "../../lib/runtime-session-config"
import { installedCliRuntimeDescriptors, loadRuntimeDescriptors } from "../../lib/session-runtimes"
import { CliModelSelect, CliOptionSelect } from "./cli-toolbar"
import { AgentSelector, ModelSelector, VariantSelector } from "./prompt-toolbar"
import { SessionConfigToolbarRow } from "./session-config-toolbar-row"

interface ToolbarOption {
	value: string
	label: string
	muted?: boolean
}

function cliEffortOptions(
	t: ReturnType<typeof useTranslation>["t"],
	efforts: string[],
): ToolbarOption[] {
	return [
		{ value: "__default__", label: t("runtimePicker.effortDefault"), muted: true },
		...efforts.map((effort) => ({
			value: effort,
			label: t("runtimePicker.effortLevel", {
				level: effort.charAt(0).toUpperCase() + effort.slice(1),
			}),
		})),
	]
}

export interface RuntimeToolbarAgentSection {
	agents: SdkAgent[]
	selectedAgent: string | null
	defaultAgent?: string
	onSelectAgent: (agentName: string) => void
	disabled?: boolean
}

export interface RuntimeToolbarManagedModelSection {
	providers: ProvidersData | null
	effectiveModel: ModelRef | null
	hasOverride: boolean
	onSelectModel: (model: ModelRef | null) => void
	recentModels?: ModelRef[]
	disabled?: boolean
}

export interface RuntimeToolbarVariantSection {
	variants: string[]
	selectedVariant: string | undefined
	onSelectVariant: (variant: string | undefined) => void
	disabled?: boolean
}

export interface RuntimeToolbarCliModelSection {
	models: AgentRuntimeDescriptor["models"]
	value: string
	onValueChange: (value: string) => void
}

export interface RuntimeToolbarSandboxSection {
	value: AgentSandbox
	onValueChange: (value: AgentSandbox) => void
}

export interface RuntimeToolbarEffortSection {
	efforts: string[]
	value: string
	onValueChange: (value: string) => void
}

export interface RuntimeToolbarSections {
	agent?: RuntimeToolbarAgentSection
	managedModel?: RuntimeToolbarManagedModelSection
	variant?: RuntimeToolbarVariantSection
	cliModel?: RuntimeToolbarCliModelSection
	sandbox?: RuntimeToolbarSandboxSection
	effort?: RuntimeToolbarEffortSection
}

export type RuntimeConfigToolbarProps =
	| {
			sections: RuntimeToolbarSections
	  }
	| {
			sessionId: string
	  }

function RuntimeToolbarSectionsView({ sections }: { sections: RuntimeToolbarSections }) {
	const { t } = useTranslation()
	const hasEffort = (sections.effort?.efforts.length ?? 0) > 0

	return (
		<SessionConfigToolbarRow
			items={[
				sections.agent && (
					<AgentSelector
						agents={sections.agent.agents}
						selectedAgent={sections.agent.selectedAgent}
						defaultAgent={sections.agent.defaultAgent}
						onSelectAgent={sections.agent.onSelectAgent}
						disabled={sections.agent.disabled}
					/>
				),
				sections.managedModel && (
					<ModelSelector
						providers={sections.managedModel.providers}
						effectiveModel={sections.managedModel.effectiveModel}
						hasOverride={sections.managedModel.hasOverride}
						onSelectModel={sections.managedModel.onSelectModel}
						recentModels={sections.managedModel.recentModels}
						disabled={sections.managedModel.disabled}
					/>
				),
				sections.cliModel && (
					<CliModelSelect
						models={sections.cliModel.models}
						value={sections.cliModel.value}
						onValueChange={sections.cliModel.onValueChange}
					/>
				),
				sections.variant && (
					<VariantSelector
						variants={sections.variant.variants}
						selectedVariant={sections.variant.selectedVariant}
						onSelectVariant={sections.variant.onSelectVariant}
						disabled={sections.variant.disabled}
					/>
				),
				sections.sandbox && (
					<CliOptionSelect
						aria-label={t("runtimePicker.sandbox")}
						value={sections.sandbox.value}
						onValueChange={(value) => sections.sandbox?.onValueChange(value as AgentSandbox)}
						options={[
							{ value: "plan", label: t("runtimePicker.sandboxPlan") },
							{ value: "read-only", label: t("runtimePicker.sandboxReadOnly") },
							{ value: "workspace-write", label: t("runtimePicker.sandboxWorkspaceWrite") },
							{ value: "danger-full-access", label: t("runtimePicker.sandboxFullAccess") },
						]}
					/>
				),
				hasEffort && sections.effort && (
					<CliOptionSelect
						aria-label={t("runtimePicker.effort")}
						value={sections.effort.value || "__default__"}
						onValueChange={(value) =>
							sections.effort?.onValueChange(value === "__default__" ? "" : value)
						}
						options={cliEffortOptions(t, sections.effort.efforts)}
					/>
				),
			]}
		/>
	)
}

export function RuntimeConfigToolbar(props: RuntimeConfigToolbarProps) {
	if ("sessionId" in props) {
		return <CliSessionRuntimeConfigToolbar sessionId={props.sessionId} />
	}

	return <RuntimeToolbarSectionsView sections={props.sections} />
}

function CliSessionRuntimeConfigToolbar({ sessionId }: { sessionId: string }) {
	const runtimeState = useSessionRuntimeState(sessionId)
	const meta = cliRuntimeMeta(runtimeState)
	const [runtimes, setRuntimes] = useState<SessionRuntimeDescriptor[]>([])

	const runtimeId = meta?.runtimeId
	useEffect(() => {
		if (!runtimeId) return
		loadRuntimeDescriptors().then((all) => setRuntimes(installedCliRuntimeDescriptors(all)))
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
		<RuntimeToolbarSectionsView
			sections={{
				cliModel: {
					models,
					value: currentSlug,
					onValueChange: (value) => apply({ model: value, effort: "" }),
				},
				sandbox: {
					value: meta.sandbox,
					onValueChange: (value) => apply({ sandbox: value }),
				},
				effort: descriptor.capabilities.reasoningEffort
					? {
							efforts,
							value: currentEffort,
							onValueChange: (value) => apply({ effort: value }),
						}
					: undefined,
			}}
		/>
	)
}
