/**
 * Toolbar header for the automations left panel.
 *
 * Shows "Automations" title, execution queue stats, and "+ New" button.
 */

import { Button } from "@palot/ui/components/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@palot/ui/components/tooltip"
import type { AutomationQueueStats } from "@desktop/preload"
import { FilterIcon, PlusIcon } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { fetchAutomationQueueStats } from "@/services/backend"

interface InboxToolbarProps {
	onNewClick: () => void
}

export function InboxToolbar({ onNewClick }: InboxToolbarProps) {
	const [queue, setQueue] = useState<AutomationQueueStats | null>(null)

	const refreshQueue = useCallback(async () => {
		try {
			setQueue(await fetchAutomationQueueStats())
		} catch {
			setQueue(null)
		}
	}, [])

	useEffect(() => {
		refreshQueue()
		const interval = setInterval(refreshQueue, 5000)
		const off = window.palot?.onAutomationRunsUpdated?.(refreshQueue)
		return () => {
			clearInterval(interval)
			off?.()
		}
	}, [refreshQueue])

	const queueLabel =
		queue && (queue.active > 0 || queue.pending > 0)
			? `${queue.active} running${queue.pending > 0 ? `, ${queue.pending} queued` : ""}`
			: null

	return (
		<div className="flex items-center gap-2 border-b border-border/50 px-4 py-3">
			<h1 className="text-sm font-semibold">Automations</h1>
			{queueLabel && (
				<span className="text-[10px] text-muted-foreground tabular-nums">{queueLabel}</span>
			)}

			<div className="ml-auto flex items-center gap-1">
				<Tooltip>
					<TooltipTrigger
						render={<Button variant="ghost" size="icon" className="size-7" disabled />}
					>
						<FilterIcon className="size-3.5" />
						<span className="sr-only">Filter</span>
					</TooltipTrigger>
					<TooltipContent>Filter automations</TooltipContent>
				</Tooltip>

				<Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={onNewClick}>
					<PlusIcon className="size-3.5" />
					New
				</Button>
			</div>
		</div>
	)
}