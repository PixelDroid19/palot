/**
 * Lit renderer entry — no React / Jotai / Tailwind required for product chrome.
 */
import "./components/gcode-app"

// Ensure root exists and mount custom element
const root = document.getElementById("root")
if (root) {
	root.innerHTML = ""
	const app = document.createElement("gcode-app")
	root.appendChild(app)
}

// Dark tokens on document for splash handoff
document.documentElement.classList.add("dark")
document.documentElement.dataset.litShell = "1"
