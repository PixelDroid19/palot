import { Hono } from "hono"

const app = new Hono()
	.get("/opencode", (c) =>
		c.json({ error: "OpenCode uses ACP stdio; no HTTP server is available" }, 410),
	)
	.get("/", (c) => c.json({ servers: [] }, 200))
	.post("/start", (c) =>
		c.json({ error: "OpenCode uses ACP stdio; no HTTP server is available" }, 410),
	)
	.post("/stop", (c) => c.json({ stopped: false }, 200))

export default app
