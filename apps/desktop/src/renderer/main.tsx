/**
 * Renderer entry with Lit as the desktop product shell.
 *
 * `?shell=react` keeps the former implementation available as a temporary
 * visual reference while the remaining legacy code is retired.
 */
import "./index.css"

const useReactReference = new URLSearchParams(location.search).get("shell") === "react"

if (useReactReference) {
	const [{ StrictMode, createElement }, { createRoot }, { App }] = await Promise.all([
		import("react"),
		import("react-dom/client"),
		import("./app"),
	])
	createRoot(document.getElementById("root")!).render(
		createElement(StrictMode, null, createElement(App)),
	)

} else {
	await import("./lit/register")
	await import("./lit/main-lit")
}
