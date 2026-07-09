import {
	SearchableListPopover,
	SearchableListPopoverContent,
	SearchableListPopoverEmpty,
	SearchableListPopoverGroup,
	SearchableListPopoverItem,
	SearchableListPopoverList,
	SearchableListPopoverSearch,
	SearchableListPopoverTrigger,
	useSearchableListPopoverSearch,
} from "@gcode/ui/components/searchable-list-popover"
import { cn } from "@gcode/ui/lib/utils"
import { CheckIcon, ChevronDownIcon } from "lucide-react"
import { useMemo, useState, type ReactNode } from "react"

const TOOLBAR_TRIGGER_BASE_CN =
	"flex h-7 items-center gap-1 rounded-md border-none bg-transparent px-2 text-xs shadow-none transition-colors"

export interface SearchableOptionSelectItem {
	value: string
	label: string
	group: string
	searchTerms?: string[]
	description?: string
	badge?: string
	leading?: ReactNode
}

export function SearchableOptionSelect({
	ariaLabel,
	items,
	value,
	onValueChange,
	placeholder,
	searchPlaceholder,
	emptyLabel,
	disabled,
	renderTriggerValue,
}: {
	ariaLabel: string
	items: SearchableOptionSelectItem[]
	value: string | null
	onValueChange: (value: string) => void
	placeholder: string
	searchPlaceholder: string
	emptyLabel: string
	disabled?: boolean
	renderTriggerValue?: (item: SearchableOptionSelectItem | null) => ReactNode
}) {
	const active = useMemo(() => items.find((item) => item.value === value) ?? null, [items, value])
	const [open, setOpen] = useState(false)

	return (
		<SearchableListPopover open={open} onOpenChange={setOpen}>
			<SearchableListPopoverTrigger
				aria-label={ariaLabel}
				className={cn(
					TOOLBAR_TRIGGER_BASE_CN,
					"hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50",
				)}
				disabled={disabled}
			>
				{renderTriggerValue ? (
					renderTriggerValue(active)
				) : active ? (
					<span className="truncate">{active.label}</span>
				) : (
					<span className="text-muted-foreground">{placeholder}</span>
				)}
				<ChevronDownIcon className="size-4 shrink-0 text-muted-foreground pointer-events-none" />
			</SearchableListPopoverTrigger>
			<SearchableListPopoverContent side="top" align="start">
				<SearchableListPopoverSearch placeholder={searchPlaceholder} />
				<SearchableOptionSelectList
					items={items}
					activeValue={value}
					emptyLabel={emptyLabel}
					onSelect={(next) => {
						onValueChange(next)
						setOpen(false)
					}}
				/>
			</SearchableListPopoverContent>
		</SearchableListPopover>
	)
}

function SearchableOptionSelectList({
	items,
	activeValue,
	emptyLabel,
	onSelect,
}: {
	items: SearchableOptionSelectItem[]
	activeValue: string | null
	emptyLabel: string
	onSelect: (value: string) => void
}) {
	const search = useSearchableListPopoverSearch()
	const filtered = useMemo(() => {
		if (!search) return items
		const query = search.toLowerCase()
		return items.filter((item) => {
			const haystack = [
				item.label,
				item.description,
				item.group,
				...(item.searchTerms ?? []),
			]
				.filter(Boolean)
				.join(" ")
				.toLowerCase()
			return haystack.includes(query)
		})
	}, [items, search])

	const groups = useMemo(() => {
		const map = new Map<string, SearchableOptionSelectItem[]>()
		for (const item of filtered) {
			const existing = map.get(item.group)
			if (existing) {
				existing.push(item)
			} else {
				map.set(item.group, [item])
			}
		}
		return Array.from(map.entries())
	}, [filtered])

	return (
		<SearchableListPopoverList>
			{filtered.length === 0 ? (
				<SearchableListPopoverEmpty>{emptyLabel}</SearchableListPopoverEmpty>
			) : (
				groups.map(([group, groupItems]) => (
					<SearchableListPopoverGroup key={group} label={group}>
						{groupItems.map((item) => (
							<SearchableListPopoverItem
								key={`${group}:${item.value}`}
								onSelect={() => onSelect(item.value)}
							>
								{item.leading}
								<div className="min-w-0 flex-1">
									<div className="truncate">{item.label}</div>
									{item.description ? (
										<div className="truncate text-[10px] text-muted-foreground/40">
											{item.description}
										</div>
									) : null}
								</div>
								{item.badge ? (
									<span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground/60">
										{item.badge}
									</span>
								) : null}
								{item.value === activeValue ? (
									<CheckIcon className="size-3.5 shrink-0 text-primary" />
								) : null}
							</SearchableListPopoverItem>
						))}
					</SearchableListPopoverGroup>
				))
			)}
		</SearchableListPopoverList>
	)
}
