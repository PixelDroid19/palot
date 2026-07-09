/**
 * Runtime switcher available in every chat: one conversation can move between
 * OpenCode, Codex and Claude Code mid-session. The transcript stays and history
 * is handed off so context survives the switch.
 */
import { useNavigate, useParams } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import type { SessionRuntimeDescriptor } from "../../../preload/api"
import { useTranslation } from "../../i18n/use-translation"
import { installedSessionRuntimeOptions, loadRuntimeDescriptors } from "../../lib/session-runtimes"
import { switchRuntimeSession } from "../../services/runtime-session-launch"
import { RuntimeOptionSelect } from "./runtime-option-select"

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
	const [runtimes, setRuntimes] = useState<SessionRuntimeDescriptor[]>([])
	useEffect(() => {
		loadRuntimeDescriptors().then((all) => setRuntimes(all))
	}, [])
	if (runtimes.length === 0) return null
	const runtimeOptions = installedSessionRuntimeOptions(runtimes)

	const switchTo = async (target: string) => {
		if (target === current) return
		const nextId = await switchRuntimeSession(sessionId, target)
		if (nextId && nextId !== sessionId && params.projectSlug) {
			navigate({
				to: "/project/$projectSlug/session/$sessionId",
				params: { projectSlug: params.projectSlug, sessionId: nextId },
			})
		}
	}

	return (
		<RuntimeOptionSelect
			aria-label={t("runtimePicker.runtime")}
			value={current}
			onValueChange={(value) => void switchTo(value)}
			options={runtimeOptions}
		/>
	)
}
