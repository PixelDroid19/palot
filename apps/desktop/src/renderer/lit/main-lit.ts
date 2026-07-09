/**
 * Lit product bootstrap.
 */
import "./components/gcode-app"

const root = document.getElementById("root")
if (root) {
	root.innerHTML = ""
	root.appendChild(document.createElement("gcode-app"))
}
document.documentElement.classList.add("dark")
document.documentElement.dataset.litShell = "1"
