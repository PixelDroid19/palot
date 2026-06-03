import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./app"
import "./index.css"
// Side effect: hydrate mock fixtures before first paint when ?mock=1 is present
import "./mock-mode-bootstrap"
// Side-effect import: registers all palot-* custom elements (Lit web components).
// Required for <palot-*> usage in React (createElement) or any host during migration.
// Per @palot/lit-components README + roadmap/lit-migration.md + IMPORT-ARCHITECTURE.md.
// Import here (renderer entry) so it runs for both Electron and browser dev.
import "@palot/lit-components"

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<App />
	</StrictMode>,
)
