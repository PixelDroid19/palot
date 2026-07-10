/**
 * Settings section — React host for progressive Lit `<gcode-settings-section>`.
 */
import { createElement, type ReactNode } from "react"
import "../../lit/components/gcode-settings-section"

interface SettingsSectionProps {
	title?: string
	description?: string
	children: ReactNode
}

export function SettingsSection({ title, description, children }: SettingsSectionProps) {
	return createElement(
		"gcode-settings-section",
		{
			heading: title ?? "",
			description: description ?? "",
			"data-lit-settings-section": "1",
		},
		children,
	)
}
