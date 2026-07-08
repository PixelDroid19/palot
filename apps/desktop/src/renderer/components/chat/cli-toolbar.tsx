/**
 * Toolbar for CLI-backed sessions: model and reasoning-effort pickers driven
 * by the runtime's own catalog (agent-host descriptors), applied to the NEXT
 * turn via the session's CLI meta. Mid-session switching works because both
 * Codex and Claude accept model overrides when resuming a session.
 */
import { NativeSelect, NativeSelectOption } from "@palot/ui/components/native-select"
import { useNavigate, useParams } from "@tanstack/react-router"
import { useAtomValue } from "jotai"
import { useEffect, useState } from "react"
import type { AgentRuntimeDescriptor, AgentSandbox } from "../../../preload/api"
import { cliSessionsAtom, patchCliMeta } from "../../atoms/cli-sessions"
import { useAgentActions } from "../../hooks/use-server"
import { useTranslation } from "../../i18n/use-translation"
import {
	availableRuntimeModels,
	getRuntimeModelEfforts,
	resolveRuntimeEffort,
	resolveRuntimeModel,
} from "../../lib/runtime-model-selection"
import { loadRuntimeDescriptors } from "../../lib/session-runtimes"
import {
	persistCliSession,
	switchCliRuntime,
	switchCliSessionToOpenCode,
} from "../../services/cli-chat"

/**
 * Runtime switcher available in EVERY chat (OpenCode or CLI-backed): one
 * conversation can move between OpenCode, Codex and Claude Code mid-session.
 * The transcript stays and the history is handed off to the new runtime, so
 * context survives the switch.
 */
export function SessionRuntimeSwitch({
	sessionId,
	current,
}: {
	sessionId: string
	current: string
}) {
	const { t } = useTranslation()
	const navigate = useNavigate()
	const params = useParams({ strict: false }) as { projectSlug?: string }
	const { createSession } = useAgentActions()
	const [runtimes, setRuntimes] = useState<AgentRuntimeDescriptor[]>([])
	useEffect(() => {
		loadRuntimeDescriptors().then((all) => setRuntimes(all.filter((d) => d.installed)))
	}, [])
	if (runtimes.length === 0) return null

	const switchTo = async (target: string) => {
		if (target === current) return
		if (target === "opencode") {
			const newId = await switchCliSessionToOpenCode(sessionId, (directory, title) =>
				createSession(directory, title),
			)
			if (newId && params.projectSlug) {
				navigate({
					to: "/project/$projectSlug/session/$sessionId",
					params: { projectSlug: params.projectSlug, sessionId: newId },
				})
			}
			return
		}
		await switchCliRuntime(sessionId, target)
	}

	return (
		<NativeSelect
			aria-label={t("runtimePicker.runtime")}
			size="sm"
			value={current}
			onChange={(e) => void switchTo(e.target.value)}
		>
			<NativeSelectOption value="opencode">OpenCode</NativeSelectOption>
			{runtimes.map((r) => (
				<NativeSelectOption key={r.id} value={r.id}>
					{r.displayName}
				</NativeSelectOption>
			))}
		</NativeSelect>
	)
}

export function CliSessionToolbar({ sessionId }: { sessionId: string }) {
	const { t } = useTranslation()
	const meta = useAtomValue(cliSessionsAtom)[sessionId]
	const [runtimes, setRuntimes] = useState<AgentRuntimeDescriptor[]>([])

	const runtimeId = meta?.runtimeId
	useEffect(() => {
		if (!runtimeId) return
		loadRuntimeDescriptors().then((all) => setRuntimes(all.filter((d) => d.installed)))
	}, [runtimeId])

	const descriptor = runtimes.find((d) => d.id === runtimeId)
	if (!meta || !descriptor) return null

	const models = availableRuntimeModels(descriptor)
	const currentSlug = resolveRuntimeModel(descriptor, meta.model) ?? ""
	const currentEffort = resolveRuntimeEffort(descriptor, currentSlug, meta.effort) ?? ""
	const efforts = getRuntimeModelEfforts(descriptor, currentSlug)

	useEffect(() => {
		const normalizedModel = currentSlug || undefined
		const normalizedEffort = currentEffort || undefined
		if (meta.model === normalizedModel && meta.effort === normalizedEffort) return
		patchCliMeta(sessionId, {
			model: normalizedModel,
			effort: normalizedEffort,
		})
		persistCliSession(sessionId)
	}, [currentEffort, currentSlug, meta.effort, meta.model, sessionId])

	const apply = (patch: { model?: string; effort?: string; sandbox?: AgentSandbox }) => {
		const nextModel = resolveRuntimeModel(descriptor, patch.model ?? meta.model)
		const nextEffort = resolveRuntimeEffort(descriptor, nextModel, patch.effort ?? meta.effort)
		patchCliMeta(sessionId, {
			model: nextModel,
			effort: nextEffort,
			sandbox: patch.sandbox ?? meta.sandbox,
		})
		persistCliSession(sessionId)
	}

	return (
		<div className="flex items-center gap-1.5">
			<SessionRuntimeSwitch sessionId={sessionId} current={meta.runtimeId} />
			{models.length > 0 && (
				<NativeSelect
					aria-label={t("runtimePicker.model")}
					size="sm"
					value={currentSlug}
					onChange={(e) => apply({ model: e.target.value, effort: "" })}
				>
					{models.map((m) => (
						<NativeSelectOption key={m.slug} value={m.slug}>
							{m.label}
						</NativeSelectOption>
					))}
				</NativeSelect>
			)}
			<NativeSelect
				aria-label={t("runtimePicker.sandbox")}
				size="sm"
				value={meta.sandbox}
				onChange={(e) => apply({ sandbox: e.target.value as AgentSandbox })}
			>
				<NativeSelectOption value="plan">{t("runtimePicker.sandboxPlan")}</NativeSelectOption>
				<NativeSelectOption value="read-only">
					{t("runtimePicker.sandboxReadOnly")}
				</NativeSelectOption>
				<NativeSelectOption value="workspace-write">
					{t("runtimePicker.sandboxWorkspaceWrite")}
				</NativeSelectOption>
				<NativeSelectOption value="danger-full-access">
					{t("runtimePicker.sandboxFullAccess")}
				</NativeSelectOption>
			</NativeSelect>
			{descriptor.capabilities.reasoningEffort && efforts.length > 0 && (
				<NativeSelect
					aria-label={t("runtimePicker.effort")}
					size="sm"
					value={currentEffort}
					onChange={(e) => apply({ effort: e.target.value })}
				>
					<NativeSelectOption value="">{t("runtimePicker.effortDefault")}</NativeSelectOption>
					{efforts.map((effort) => (
						<NativeSelectOption key={effort} value={effort}>
							{t("runtimePicker.effortLevel", { level: effort })}
						</NativeSelectOption>
					))}
				</NativeSelect>
			)}
		</div>
	)
}
