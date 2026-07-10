import { Hono } from "hono"
import { cors } from "hono/cors"
import health from "./routes/health"
import modelState from "./routes/model-state"
import servers from "./routes/servers"

// ============================================================
// App — CORS middleware applied first, then routes chained for RPC
// ============================================================

const app = new Hono()

// Middleware — applied via .use() before route chaining
app.use(
	"*",
	cors({
		origin: ["http://localhost:1420", "http://127.0.0.1:1420"],
	}),
)

// Routes — chained for Hono RPC type inference
const routes = app
	.route("/api/servers", servers)
	.route("/api/model-state", modelState)
	.route("/health", health)

export type AppType = typeof routes

// ============================================================
// Start
// ============================================================

const port = Number(process.env.PORT) || 3100

console.log(`GCode server starting on port ${port}`)

// OpenCode is an ACP stdio runtime owned by the desktop agent host. This
// Browser mode intentionally does not start an OpenCode process; desktop
// sessions use the agent-host ACP transport instead.

export default {
	port,
	fetch: app.fetch,
}
