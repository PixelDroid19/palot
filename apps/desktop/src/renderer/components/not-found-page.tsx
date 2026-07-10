/**
 * Not found page — React host for Lit empty-state chrome.
 */
import { useRouter } from "@tanstack/react-router"
import { createElement, useEffect, useRef } from "react"
import "../lit/components/gcode-empty-state"

export function NotFoundPage() {
	const router = useRouter()
	const ref = useRef<HTMLElement | null>(null)

	useEffect(() => {
		const node = ref.current
		if (!node) return
		const onAction = (e: Event) => {
			const action = (e as CustomEvent<{ action: string }>).detail?.action
			if (action === "primary") router.navigate({ to: "/" })
		}
		node.addEventListener("gcode-empty-action", onAction)
		return () => node.removeEventListener("gcode-empty-action", onAction)
	}, [router])

	return createElement("gcode-empty-state", {
		ref,
		variant: "not-found",
		heading: "Page not found",
		message: "The page you're looking for doesn't exist or has been moved.",
		"primary-label": "Go home",
		"data-lit-empty-state": "1",
	})
}
