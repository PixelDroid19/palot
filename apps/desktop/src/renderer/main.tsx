/**
 * Renderer entry with a non-default Lit parity preview.
 *
 * `?shell=lit` mounts the Lit candidate for side-by-side visual QA. The
 * default remains the React reference until the parity gate is complete.
 */
import "./index.css"

const useLitPreview = new URLSearchParams(location.search).get("shell") === "lit"

if (useLitPreview) {
	await import("./lit/register")
	await import("./lit/main-lit")
} else {
	const [{ StrictMode, createElement }, { createRoot }, { App }] = await Promise.all([
		import("react"),
		import("react-dom/client"),
		import("./app"),
		import("./lit/register"),
	])
	createRoot(document.getElementById("root")!).render(
		createElement(StrictMode, null, createElement(App)),
	)
}
