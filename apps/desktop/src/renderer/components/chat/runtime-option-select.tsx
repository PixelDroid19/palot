/**
 * Neutral compact option select used by the shared runtime config toolbar.
 * Same chrome for every runtime (OpenCode, Codex, Claude, …).
 */
import { Select, SelectContent, SelectItem, SelectTrigger } from "@palot/ui/components/select"
import { cn } from "@palot/ui/lib/utils"

const TOOLBAR_TRIGGER_CN =
	"h-7! gap-1 border-none bg-transparent! hover:bg-muted! px-2! py-0! text-xs shadow-none transition-colors"

export interface RuntimeToolbarOption {
	value: string
	label: string
	muted?: boolean
}

export function RuntimeOptionSelect({
	"aria-label": ariaLabel,
	value,
	options,
	onValueChange,
}: {
	"aria-label": string
	value: string
	options: RuntimeToolbarOption[]
	onValueChange: (value: string) => void
}) {
	const active = options.find((option) => option.value === value) ?? options[0]
	if (!active) return null

	return (
		<Select
			value={active.value}
			onValueChange={(next) => {
				if (next != null) onValueChange(next)
			}}
		>
			<SelectTrigger aria-label={ariaLabel} className={TOOLBAR_TRIGGER_CN}>
				<span className={cn("truncate", active.muted && "text-muted-foreground")}>
					{active.label}
				</span>
			</SelectTrigger>
			<SelectContent side="top" align="start" alignItemWithTrigger={false}>
				{options.map((option) => (
					<SelectItem key={option.value} value={option.value}>
						<span className={cn(option.muted && "text-muted-foreground")}>{option.label}</span>
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	)
}

/** @deprecated Use RuntimeOptionSelect — shared across all runtimes. */
export const CliOptionSelect = RuntimeOptionSelect
