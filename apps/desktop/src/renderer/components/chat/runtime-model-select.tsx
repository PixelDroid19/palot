import { ProviderIcon } from "../settings/provider-icon"
import {
	SearchableOptionSelect,
	type SearchableOptionSelectItem,
} from "./searchable-option-select"

export interface RuntimeModelSelectItem extends SearchableOptionSelectItem {
	provider?: {
		id: string
		name: string
	}
}

export function RuntimeModelSelect({
	items,
	value,
	onValueChange,
	disabled,
}: {
	items: RuntimeModelSelectItem[]
	value: string | null
	onValueChange: (value: string) => void
	disabled?: boolean
}) {
	return (
		<SearchableOptionSelect
			ariaLabel="Model"
			items={items}
			value={value}
			onValueChange={onValueChange}
			placeholder="Select model..."
			searchPlaceholder="Search models..."
			emptyLabel="No models found"
			disabled={disabled}
			renderTriggerValue={(item) =>
				item ? (
					<>
						{item.provider ? (
							<ProviderIcon id={item.provider.id} name={item.provider.name} size="xs" />
						) : null}
						<span>{item.label}</span>
					</>
				) : (
					<span className="text-muted-foreground">Select model...</span>
				)
			}
		/>
	)
}
