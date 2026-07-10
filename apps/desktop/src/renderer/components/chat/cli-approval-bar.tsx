/**
 * Approval bar for CLI-backed sessions — React host + jotai wiring for Lit panel.
 */
import { useAtomValue } from "jotai"
import { createElement, useEffect, useRef } from "react"
import { cliPermissionsAtom } from "../../atoms/cli-sessions"
import { useTranslation } from "../../i18n/use-translation"
import type { CliApprovalRequestView } from "../../lit/components/gcode-cli-approval"
import "../../lit/components/gcode-cli-approval"
import { respondRuntimePermissionRequest } from "../../services/runtime-session-actions"

export function CliApprovalBar({ sessionId }: { sessionId: string }) {
	const { t } = useTranslation()
	const pending = useAtomValue(cliPermissionsAtom)[sessionId] ?? []
	const ref = useRef<HTMLElement | null>(null)

	useEffect(() => {
		const node = ref.current
		if (!node) return
		const onDecision = (e: Event) => {
			const ce = e as CustomEvent<{
				requestId: string
				decision: "accept" | "acceptForSession" | "decline"
			}>
			void respondRuntimePermissionRequest(sessionId, ce.detail.requestId, ce.detail.decision)
		}
		node.addEventListener("gcode-permission-decision", onDecision)
		return () => node.removeEventListener("gcode-permission-decision", onDecision)
	}, [sessionId, pending.length])

	if (pending.length === 0) return null

	const requests: CliApprovalRequestView[] = pending.map((request) => ({
		requestId: request.requestId,
		name: request.name,
		title: t("cliApprovals.title", { name: request.name }),
		detail: request.detail,
		reason: request.reason,
		decisions: request.decisions ?? [],
	}))

	return createElement("gcode-cli-approval", {
		ref,
		"session-id": sessionId,
		requests,
		"label-allow": t("cliApprovals.allow"),
		"label-allow-session": t("cliApprovals.allowSession"),
		"label-deny": t("cliApprovals.deny"),
		"data-lit-cli-approval": "1",
	})
}
