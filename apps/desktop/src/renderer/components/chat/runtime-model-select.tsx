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
			renderTriggerValue={(item) => {
				const model = item as RuntimeModelSelectItem | null
				return model ? (
					<>
						{model.provider ? (
							<ProviderIcon id={model.provider.id} name={model.provider.name} size="xs" />
						) : null}
						<span>{model.label}</span>
					</>
				) : (
					<span className="text-muted-foreground">Select model...</span>
				)
			}}
		/>
	)
}
