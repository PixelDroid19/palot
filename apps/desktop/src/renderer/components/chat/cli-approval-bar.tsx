/**
 * Approval bar for CLI-backed sessions. When the agent asks to run a command
 * or edit files outside its sandbox, the request blocks until answered here —
 * the same allow / allow-for-session / deny flow the CLIs offer in their own
 * UIs, surfaced above the prompt input.
 */
import { Button } from "@gcode/ui/components/button"
import { useAtomValue } from "jotai"
import { ShieldQuestion } from "lucide-react"
import { cliPermissionsAtom } from "../../atoms/cli-sessions"
import { useTranslation } from "../../i18n/use-translation"
import { respondRuntimePermissionRequest } from "../../services/runtime-session-actions"

export function CliApprovalBar({ sessionId }: { sessionId: string }) {
	const { t } = useTranslation()
	const pending = useAtomValue(cliPermissionsAtom)[sessionId] ?? []
	if (pending.length === 0) return null

	return (
		<div className="mb-2 flex flex-col gap-2">
			{pending.map((request) => (
				<div
					key={request.requestId}
					className="flex flex-col gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3"
				>
					<div className="flex items-start gap-2">
						<ShieldQuestion className="mt-0.5 size-4 shrink-0 text-amber-500" />
						<div className="min-w-0 flex-1">
							<div className="font-medium text-sm">
								{t("cliApprovals.title", { name: request.name })}
							</div>
							{request.detail && (
								<code className="mt-1 block truncate rounded bg-black/20 px-1.5 py-0.5 font-mono text-xs">
									{request.detail}
								</code>
							)}
							{request.reason && (
								<div className="mt-1 text-muted-foreground text-xs">{request.reason}</div>
							)}
						</div>
					</div>
					<div className="flex gap-2 self-end">
						<Button
							size="sm"
							variant="outline"
							onClick={() => respondRuntimePermissionRequest(sessionId, request.requestId, "decline")}
						>
							{t("cliApprovals.deny")}
						</Button>
						{request.decisions.includes("acceptForSession") && (
							<Button
								size="sm"
								variant="outline"
								onClick={() =>
									respondRuntimePermissionRequest(
										sessionId,
										request.requestId,
										"acceptForSession",
									)
								}
							>
								{t("cliApprovals.allowSession")}
							</Button>
						)}
						<Button
							size="sm"
							onClick={() => respondRuntimePermissionRequest(sessionId, request.requestId, "accept")}
						>
							{t("cliApprovals.allow")}
						</Button>
					</div>
				</div>
			))}
		</div>
	)
}
