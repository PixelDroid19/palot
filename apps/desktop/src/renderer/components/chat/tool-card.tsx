/**
 * Tool call chrome — React host for progressive Lit `<gcode-tool-card>`.
 * Body content (diffs, bash, etc.) stays React and projects into the default slot.
 */
import { createElement, memo, type ReactNode } from "react"
import {
	getToolCategory as pureGetToolCategory,
	type ToolCategory,
} from "../../lit/tool-category"
import "../../lit/components/gcode-tool-card"

export type { ToolCategory }
export const getToolCategory = pureGetToolCategory

/** @deprecated category no longer paints neon rails; empty map kept for callers */
export const TOOL_CATEGORY_COLORS: Record<ToolCategory, string> = {
	explore: "",
	edit: "",
	run: "",
	delegate: "",
	plan: "",
	ask: "",
	fetch: "",
	other: "",
}

interface ToolCardProps {
	icon: ReactNode
	title: string
	subtitle?: string
	/** Right-aligned element in the header (duration, status, etc.) */
	trailing?: ReactNode
	/** Category for semantics only */
	category?: ToolCategory
	/** Whether the card should be open by default */
	defaultOpen?: boolean
	/** Force the card open (for errors, permissions) */
	forceOpen?: boolean
	/** Whether the card has expandable content */
	hasContent?: boolean
	/** Status indicator */
	status?: "running" | "error" | "completed" | "pending"
	/** Expandable content */
	children?: ReactNode
}

export const ToolCard = memo(function ToolCard({
	icon,
	title,
	subtitle,
	trailing,
	defaultOpen = false,
	forceOpen = false,
	hasContent = false,
	status,
	children,
}: ToolCardProps) {
	const showContent = Boolean(hasContent && children != null)

	return createElement(
		"gcode-tool-card",
		{
			// Property API (camelCase) — React sets CE properties directly
			cardTitle: title,
			subtitle: subtitle ?? "",
			status: status ?? "",
			hasContent: showContent,
			defaultOpen,
			forceOpen,
			"data-lit-tool-card": "1",
			"data-slot": "tool-card",
		},
		createElement("span", { slot: "icon", key: "icon" }, icon),
		trailing != null
			? createElement("span", { slot: "trailing", key: "trailing" }, trailing)
			: null,
		showContent ? children : null,
	)
})
