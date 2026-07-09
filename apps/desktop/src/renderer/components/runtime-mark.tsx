/**
 * Brand SVG marks for coding runtimes in session pills.
 *
 * Simplified official-looking marks (license-safe monograms / geometric marks).
 * Animation is applied to the brand itself via CSS (spin/pulse) from status.
 */
import { cn } from "@palot/ui/lib/utils"
import { memo, type ReactElement, type ReactNode } from "react"
import {
	iconAnimationClassName,
	runtimeIdToIconKey,
	sessionStatusToIconAnimation,
	type RuntimeIconKey,
} from "../lib/runtime-icons"
import { runtimeLabel } from "../lib/session-runtimes"

export interface RuntimeMarkProps {
	runtimeId?: string | null
	/** Agent status: running | waiting | failed | idle | … */
	status?: string | null
	/** Accessible name; defaults to runtime display label. */
	label?: string
	className?: string
	/** Pixel size (default 14 for sidebar density). */
	size?: number
}

function SvgShell({
	size,
	className,
	label,
	children,
}: {
	size: number
	className?: string
	label: string
	children: ReactNode
}) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			className={cn("shrink-0", className)}
			role="img"
			aria-label={label}
		>
			<title>{label}</title>
			{children}
		</svg>
	)
}

/** Anthropic Claude — starburst/asterisk-style mark (simplified). */
function ClaudeMark({ size, className, label }: { size: number; className?: string; label: string }) {
	return (
		<SvgShell size={size} className={className} label={label}>
			<path
				d="M12 2.5 L13.2 9.2 L19.5 7.5 L14.8 12 L19.5 16.5 L13.2 14.8 L12 21.5 L10.8 14.8 L4.5 16.5 L9.2 12 L4.5 7.5 L10.8 9.2 Z"
				fill="currentColor"
				className="text-[#D97757]"
			/>
		</SvgShell>
	)
}

/** OpenAI Codex — simple geometric hex/circle monogram (simplified). */
function CodexMark({ size, className, label }: { size: number; className?: string; label: string }) {
	return (
		<SvgShell size={size} className={className} label={label}>
			<circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" className="text-emerald-500" />
			<path
				d="M8 12c0-2.2 1.8-4 4-4s4 1.8 4 4-1.8 4-4 4"
				stroke="currentColor"
				strokeWidth="1.75"
				strokeLinecap="round"
				className="text-emerald-500"
			/>
			<circle cx="12" cy="12" r="1.5" fill="currentColor" className="text-emerald-500" />
		</SvgShell>
	)
}

/** OpenCode — code-bracket monogram. */
function OpenCodeMark({
	size,
	className,
	label,
}: {
	size: number
	className?: string
	label: string
}) {
	return (
		<SvgShell size={size} className={className} label={label}>
			<path
				d="M8 7 L4 12 L8 17"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
				className="text-sky-400"
			/>
			<path
				d="M16 7 L20 12 L16 17"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
				className="text-sky-400"
			/>
			<path
				d="M13.5 5.5 L10.5 18.5"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				className="text-sky-300"
			/>
		</SvgShell>
	)
}

/** Neutral terminal glyph for unknown/custom harnesses. */
function FallbackMark({
	size,
	className,
	label,
}: {
	size: number
	className?: string
	label: string
}) {
	return (
		<SvgShell size={size} className={className} label={label}>
			<rect
				x="3.5"
				y="4.5"
				width="17"
				height="15"
				rx="2.5"
				stroke="currentColor"
				strokeWidth="1.75"
				className="text-muted-foreground"
			/>
			<path
				d="M7 10 L10 12.5 L7 15"
				stroke="currentColor"
				strokeWidth="1.75"
				strokeLinecap="round"
				strokeLinejoin="round"
				className="text-muted-foreground"
			/>
			<path
				d="M12.5 15 H17"
				stroke="currentColor"
				strokeWidth="1.75"
				strokeLinecap="round"
				className="text-muted-foreground"
			/>
		</SvgShell>
	)
}

const MARK_BY_KEY: Record<
	RuntimeIconKey,
	(props: { size: number; className?: string; label: string }) => ReactElement
> = {
	claude: ClaudeMark,
	codex: CodexMark,
	opencode: OpenCodeMark,
	fallback: FallbackMark,
}

/**
 * Session runtime identity mark — brand SVG + status-driven animation.
 */
export const RuntimeMark = memo(function RuntimeMark({
	runtimeId,
	status,
	label,
	className,
	size = 14,
}: RuntimeMarkProps) {
	const key = runtimeIdToIconKey(runtimeId)
	const animation = sessionStatusToIconAnimation(status)
	const motion = iconAnimationClassName(animation)
	const accessible = label ?? (runtimeId ? runtimeLabel(runtimeId) : "Agent")
	const Mark = MARK_BY_KEY[key]
	const failed = animation === "failed" ? "text-red-500" : ""

	return (
		<span
			className={cn(
				"inline-flex shrink-0 items-center justify-center",
				motion,
				failed,
				className,
			)}
			data-runtime-icon={key}
			data-runtime-animation={animation}
		>
			<Mark size={size} label={accessible} />
		</span>
	)
})
