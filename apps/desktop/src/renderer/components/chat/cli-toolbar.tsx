/**
 * Toolbar for CLI-backed sessions: model and reasoning-effort pickers driven
 * by the runtime's own catalog (agent-host descriptors), applied to the NEXT
 * turn via the session's CLI meta. Mid-session switching works because both
 * Codex and Claude accept model overrides when resuming a session.
 */
import { NativeSelect, NativeSelectOption } from "@palot/ui/components/native-select"
import { useAtomValue } from "jotai"
import { useEffect, useState } from "react"
import type { AgentRuntimeDescriptor, AgentSandbox } from "../../../preload/api"
import { cliSessionsAtom, patchCliMeta } from "../../atoms/cli-sessions"
import { useTranslation } from "../../i18n/use-translation"
import { loadRuntimeDescriptors } from "../../lib/session-runtimes"
import { persistCliSession } from "../../services/cli-chat"

export function CliSessionToolbar({ sessionId }: { sessionId: string }) {
	const { t } = useTranslation()
	const meta = useAtomValue(cliSessionsAtom)[sessionId]
	const [descriptor, setDescriptor] = useState<AgentRuntimeDescriptor | undefined>()

	const runtimeId = meta?.runtimeId
	useEffect(() => {
		if (!runtimeId) return
		loadRuntimeDescriptors().then((all) => setDescriptor(all.find((d) => d.id === runtimeId)))
	}, [runtimeId])

	if (!meta || !descriptor) return null

	// Sessions persisted before a catalog change may reference a slug that is
	// no longer listed; keep it selectable so the select reflects reality.
	const currentSlug = meta.model ?? ""
	const models = descriptor.models.some((m) => m.slug === currentSlug)
		? descriptor.models
		: [...descriptor.models, { slug: currentSlug, label: currentSlug, efforts: [] }]
	const efforts = models.find((m) => m.slug === currentSlug)?.efforts ?? []

	const apply = (patch: { model?: string; effort?: string; sandbox?: AgentSandbox }) => {
		patchCliMeta(sessionId, {
			model: patch.model === "" ? undefined : (patch.model ?? meta.model),
			effort: patch.effort === "" ? undefined : (patch.effort ?? meta.effort),
			sandbox: patch.sandbox ?? meta.sandbox,
		})
		persistCliSession(sessionId)
	}

	return (
		<div className="flex items-center gap-1.5">
			{models.length > 0 && (
				<NativeSelect
					aria-label={t("runtimePicker.model")}
					size="sm"
					value={currentSlug}
					onChange={(e) => apply({ model: e.target.value, effort: "" })}
				>
					{models.map((m) => (
						<NativeSelectOption key={m.slug} value={m.slug}>
							{m.slug === "" ? t("runtimePicker.defaultModel") : m.label}
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
					value={meta.effort ?? ""}
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
