import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./app"
import "./index.css"
// Side effect: hydrate mock fixtures before first paint when ?mock=1 is present
import "./mock-mode-bootstrap"

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<App />
	</StrictMode>,
)
