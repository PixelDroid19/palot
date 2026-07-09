/**
 * Onboarding Step 1: Welcome.
 *
 * Brief introduction to GCode and what the setup will cover.
 */

import { Button } from "@gcode/ui/components/button"
import { ArrowRightIcon } from "lucide-react"
import { GCodeWordmark } from "../../gcode-wordmark"

interface WelcomeStepProps {
	onContinue: () => void
}

export function WelcomeStep({ onContinue }: WelcomeStepProps) {
	return (
		<div className="flex h-full flex-col items-center justify-center px-6">
			<div className="w-full max-w-md space-y-8 text-center">
				{/* Logo */}
				<div className="flex justify-center">
					<GCodeWordmark className="h-6 w-auto text-foreground" />
				</div>

				{/* Description */}
				<div className="space-y-3">
					<p className="text-lg text-muted-foreground">
						Your native workspace for multiple coding runtimes.
					</p>
					<p className="text-sm leading-relaxed text-muted-foreground/70">
						GCode unifies OpenCode, Codex, Claude Code, and other adapters behind one session UI —
						real-time streaming, native notifications, and multi-session support without making any
						single tool the product base.
					</p>
				</div>

				{/* CTA */}
				<div className="space-y-3">
					<Button size="lg" onClick={onContinue} className="gap-2">
						Get Started
						<ArrowRightIcon aria-hidden="true" className="size-4" />
					</Button>
					<p className="text-xs text-muted-foreground/50">This takes less than a minute.</p>
				</div>
			</div>
		</div>
	)
}
