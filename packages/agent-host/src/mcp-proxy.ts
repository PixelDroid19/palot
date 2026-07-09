/**
 * Source of the stdio MCP proxy that agent CLIs launch to reach the GCode
 * bridge. Dependency-free plain-Node script (exported as a string so the
 * embedder can write it anywhere).
 *
 * Tools are **dynamic**: tools/list and tools/call hit the host tool plane
 * (`GET /v1/tools`, `POST /v1/tools/call`). The host registers automation,
 * system, browser, agents, and context tools — adapters never own that list.
 */

export const MCP_PROXY_SOURCE = `#!/usr/bin/env node
// GCode bridge MCP proxy (generated — do not edit). Dependency-free.
"use strict";
const BRIDGE = process.env.GCODE_BRIDGE_URL;
const TOKEN = process.env.GCODE_BRIDGE_TOKEN;

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

async function listTools() {
	const data = await bridge("GET", "/v1/tools");
	return data.tools || [];
}

async function callTool(name, args) {
	const data = await bridge("POST", "/v1/tools/call", {
		name: name,
		arguments: args || {},
		cwd: process.cwd(),
	});
	return typeof data.result === "string" ? data.result : JSON.stringify(data.result);
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
			serverInfo: { name: "gcode-bridge", version: "1.0.0" },
		});
	} else if (msg.method === "notifications/initialized") {
		// Notification — no response.
	} else if (msg.method === "tools/list") {
		try {
			const tools = await listTools();
			reply(msg.id, { tools: tools });
		} catch (err) {
			replyError(msg.id, err && err.message ? err.message : String(err));
		}
	} else if (msg.method === "tools/call") {
		try {
			const text = await callTool(msg.params.name, msg.params.arguments || {});
			reply(msg.id, { content: [{ type: "text", text: text }] });
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
