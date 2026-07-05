/**
 * Source of the stdio MCP proxy that agent CLIs launch to reach the Palot
 * bridge. It is a dependency-free plain-Node script (exported as a string so
 * the embedder can write it anywhere — Electron's asar can't be spawned from
 * directly). It implements just enough of MCP over stdio: initialize,
 * tools/list, tools/call; each tool call is a bearer-authenticated HTTP
 * request to the bridge.
 *
 * Tools exposed to every agent:
 *   palot_list_agents           — discover peer agents
 *   palot_delegate              — run a task on another agent, get its answer
 *   palot_context_get / _set / _list — shared context between agents
 */

export const MCP_PROXY_SOURCE = `#!/usr/bin/env node
// Palot bridge MCP proxy (generated — do not edit). Dependency-free.
"use strict";
const BRIDGE = process.env.PALOT_BRIDGE_URL;
const TOKEN = process.env.PALOT_BRIDGE_TOKEN;

async function bridge(method, path, body) {
	const res = await fetch(BRIDGE + path, {
		method,
		headers: { authorization: "Bearer " + TOKEN, "content-type": "application/json" },
		body: body ? JSON.stringify(body) : undefined,
	});
	const data = await res.json();
	if (!res.ok) throw new Error(data.error || ("Bridge error " + res.status));
	return data;
}

const TOOLS = [
	{
		name: "palot_list_agents",
		description: "List the other AI agents available on this machine that you can delegate tasks to.",
		inputSchema: { type: "object", properties: {}, additionalProperties: false },
	},
	{
		name: "palot_delegate",
		description:
			"Delegate a task to another AI agent (e.g. 'codex' for image generation or coding, 'claude' for reasoning) and return its answer. Use palot_list_agents to see valid agent ids.",
		inputSchema: {
			type: "object",
			properties: {
				agent: { type: "string", description: "Target agent id (e.g. codex, claude)" },
				prompt: { type: "string", description: "The task for the target agent" },
				cwd: { type: "string", description: "Working directory (defaults to current)" },
			},
			required: ["agent", "prompt"],
		},
	},
	{
		name: "palot_context_get",
		description: "Read a value from the shared context store that agents use to collaborate.",
		inputSchema: {
			type: "object",
			properties: { key: { type: "string" } },
			required: ["key"],
		},
	},
	{
		name: "palot_context_set",
		description: "Write a value to the shared context store so other agents can read it.",
		inputSchema: {
			type: "object",
			properties: { key: { type: "string" }, value: { type: "string" } },
			required: ["key", "value"],
		},
	},
	{
		name: "palot_context_list",
		description: "List all keys in the shared context store.",
		inputSchema: { type: "object", properties: {}, additionalProperties: false },
	},
];

async function callTool(name, args) {
	if (name === "palot_list_agents") {
		const data = await bridge("GET", "/v1/agents");
		return JSON.stringify(data.agents);
	}
	if (name === "palot_delegate") {
		const data = await bridge("POST", "/v1/delegate", {
			agent: args.agent,
			prompt: args.prompt,
			cwd: args.cwd || process.cwd(),
		});
		return data.message || "(no output)";
	}
	if (name === "palot_context_get") {
		const data = await bridge("GET", "/v1/context");
		const entry = (data.entries || []).find((e) => e.key === args.key);
		return entry ? entry.value : "(not set)";
	}
	if (name === "palot_context_set") {
		await bridge("POST", "/v1/context", { key: args.key, value: args.value });
		return "ok";
	}
	if (name === "palot_context_list") {
		const data = await bridge("GET", "/v1/context");
		return JSON.stringify((data.entries || []).map((e) => e.key));
	}
	throw new Error("Unknown tool: " + name);
}

function reply(id, result) {
	process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\\n");
}
function replyError(id, message) {
	process.stdout.write(
		JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32000, message } }) + "\\n",
	);
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
	buffer += chunk;
	let nl;
	while ((nl = buffer.indexOf("\\n")) !== -1) {
		const line = buffer.slice(0, nl).trim();
		buffer = buffer.slice(nl + 1);
		if (!line) continue;
		let msg;
		try {
			msg = JSON.parse(line);
		} catch {
			continue;
		}
		handle(msg);
	}
});

async function handle(msg) {
	if (msg.method === "initialize") {
		reply(msg.id, {
			protocolVersion: msg.params && msg.params.protocolVersion ? msg.params.protocolVersion : "2025-06-18",
			capabilities: { tools: {} },
			serverInfo: { name: "palot-bridge", version: "1.0.0" },
		});
	} else if (msg.method === "notifications/initialized") {
		// Notification — no response.
	} else if (msg.method === "tools/list") {
		reply(msg.id, { tools: TOOLS });
	} else if (msg.method === "tools/call") {
		try {
			const text = await callTool(msg.params.name, msg.params.arguments || {});
			reply(msg.id, { content: [{ type: "text", text }] });
		} catch (err) {
			reply(msg.id, {
				content: [{ type: "text", text: "Error: " + (err && err.message ? err.message : err) }],
				isError: true,
			});
		}
	} else if (msg.id !== undefined) {
		replyError(msg.id, "Method not supported: " + msg.method);
	}
}
`
