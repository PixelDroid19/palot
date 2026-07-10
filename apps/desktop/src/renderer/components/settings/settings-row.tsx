/**
 * Settings row — React host for progressive Lit `<gcode-settings-row>`.
 */
import { createElement, type ReactNode, useId } from "react"
import "../../lit/components/gcode-settings-row"

interface SettingsRowProps {
	label: string
	description?: string
	/** Optional explicit ID for the control — if not provided, one is auto-generated. */
	htmlFor?: string
	children: ReactNode
}

export function SettingsRow({ label, description, htmlFor, children }: SettingsRowProps) {
	const autoId = useId()
	const controlId = htmlFor ?? autoId

	return createElement(
		"gcode-settings-row",
		{
			label,
			description: description ?? "",
			"html-for": controlId,
			"data-lit-settings-row": "1",
		},
		children,
	)
}
