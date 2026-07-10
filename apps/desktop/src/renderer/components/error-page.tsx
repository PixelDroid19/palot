/**
 * Error page — React host for Lit empty-state chrome + router reset.
 */
import { type ErrorComponentProps, useRouter } from "@tanstack/react-router"
import { createElement, useEffect, useRef } from "react"
import "../lit/components/gcode-empty-state"

export function ErrorPage({ error, reset }: ErrorComponentProps) {
	const router = useRouter()
	const ref = useRef<HTMLElement | null>(null)
	const message = error instanceof Error ? error.message : "An unexpected error occurred"
	const stack = error instanceof Error ? (error.stack ?? "") : ""

	useEffect(() => {
		const node = ref.current
		if (!node) return
		const onAction = (e: Event) => {
			const action = (e as CustomEvent<{ action: string }>).detail?.action
			if (action === "primary") {
				reset()
				void router.invalidate()
			} else if (action === "secondary") {
				router.navigate({ to: "/" })
			}
		}
		node.addEventListener("gcode-empty-action", onAction)
		return () => node.removeEventListener("gcode-empty-action", onAction)
	}, [router, reset])

	return createElement("gcode-empty-state", {
		ref,
		variant: "error",
		heading: "Something went wrong",
		message,
		stack,
		"primary-label": "Try again",
		"secondary-label": "Go home",
		"data-lit-empty-state": "1",
	})
}
