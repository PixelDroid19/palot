/**
 * Renderer entry — full product via React app shell.
 *
 * Lit web components are registered for progressive migration (SCSS→css.js,
 * event bus, i18n controller). Unmigrated routes stay on React until their
 * visual and behavioral parity is proven. Lit modules themselves do not
 * import React.
 */
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./app"
import "./index.css"
import "./lit/register"

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<App />
	</StrictMode>,
)
