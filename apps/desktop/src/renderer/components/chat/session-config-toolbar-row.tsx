import { Separator } from "@gcode/ui/components/separator"
import { Fragment, type ReactNode } from "react"

export function SessionConfigToolbarRow({
	items,
}: {
	items: Array<ReactNode | false | null | undefined>
}) {
	const visibleItems = items.filter(
		(item): item is ReactNode => item !== null && item !== undefined && item !== false,
	)

	return (
		<div className="flex min-w-0 flex-wrap items-center gap-0.5">
			{visibleItems.map((item, index) => (
				<Fragment key={index}>
					{index > 0 && <Separator orientation="vertical" className="mx-0.5 my-2 self-stretch" />}
					{item}
				</Fragment>
			))}
		</div>
	)
}
