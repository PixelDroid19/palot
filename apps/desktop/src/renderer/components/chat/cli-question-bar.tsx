/**
 * Structured-question bar for CLI-backed sessions. When Claude Code uses its
 * AskUserQuestion tool, the run blocks until the user picks options here — the
 * selection is fed back as the tool's answer (fixes the "AskUserQuestion tool
 * doesn't provide answer" gap synara #91 hits when there is no question UI).
 */
import { Button } from "@gcode/ui/components/button"
import { useAtomValue } from "jotai"
import { MessageCircleQuestion } from "lucide-react"
import { useState } from "react"
import type { AgentQuestionRequest } from "../../../preload/api"
import { cliQuestionsAtom } from "../../atoms/cli-sessions"
import { answerRuntimeQuestionRequest } from "../../services/runtime-session-actions"

function QuestionCard({
	sessionId,
	request,
}: {
	sessionId: string
	request: AgentQuestionRequest
}) {
	// Selected option labels per question text.
	const [selected, setSelected] = useState<Record<string, string[]>>({})

	const toggle = (question: string, label: string, multi: boolean) => {
		setSelected((prev) => {
			const current = prev[question] ?? []
			if (multi) {
				return {
					...prev,
					[question]: current.includes(label)
						? current.filter((l) => l !== label)
						: [...current, label],
				}
			}
			return { ...prev, [question]: [label] }
		})
	}

	const allAnswered = request.questions.every((q) => (selected[q.question]?.length ?? 0) > 0)

	const submit = () => {
		const answers: Record<string, string> = {}
		for (const q of request.questions) {
			answers[q.question] = (selected[q.question] ?? []).join(", ")
		}
		answerRuntimeQuestionRequest(sessionId, request.requestId, answers)
	}

	return (
		<div className="flex flex-col gap-3 rounded-xl border border-blue-500/40 bg-blue-500/10 p-3">
			{request.questions.map((q) => (
				<div key={q.question} className="flex flex-col gap-2">
					<div className="flex items-center gap-2">
						<MessageCircleQuestion className="size-4 shrink-0 text-blue-500" />
						<span className="font-medium text-sm">{q.question}</span>
						{q.multiSelect && (
							<span className="text-muted-foreground text-xs">(choose any)</span>
						)}
					</div>
					<div className="flex flex-col gap-1.5">
						{q.options.map((opt) => {
							const isSelected = (selected[q.question] ?? []).includes(opt.label)
							return (
								<button
									type="button"
									key={opt.label}
									onClick={() => toggle(q.question, opt.label, q.multiSelect)}
									className={`rounded-lg border px-3 py-1.5 text-left text-sm transition-colors ${
										isSelected
											? "border-blue-500 bg-blue-500/20"
											: "border-border hover:bg-muted/50"
									}`}
								>
									<div className="font-medium">{opt.label}</div>
									{opt.description && opt.description !== opt.label && (
										<div className="text-muted-foreground text-xs">{opt.description}</div>
									)}
								</button>
							)
						})}
					</div>
				</div>
			))}
			<Button size="sm" className="self-end" disabled={!allAnswered} onClick={submit}>
				Submit
			</Button>
		</div>
	)
}

export function CliQuestionBar({ sessionId }: { sessionId: string }) {
	const pending = useAtomValue(cliQuestionsAtom)[sessionId] ?? []
	if (pending.length === 0) return null
	return (
		<div className="mb-2 flex flex-col gap-2">
			{pending.map((request) => (
				<QuestionCard key={request.requestId} sessionId={sessionId} request={request} />
			))}
		</div>
	)
}
