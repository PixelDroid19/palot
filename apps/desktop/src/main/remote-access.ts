import os from "node:os"
import { buildEndpoints, parsePort, type RemoteEndpoint } from "./lan-endpoints"
import { createLogger } from "./logger"
import { getProjectRuntimeUrl } from "./project-runtime-manager"

export type { EndpointType, RemoteEndpoint } from "./lan-endpoints"

const log = createLogger("remote-access")

export interface RemoteAccessInfo {
	/** Loopback server URL as seen by this machine, or null if the server isn't running. */
	url: string | null
	/** LAN-reachable URLs another device on the same network can connect to. */
	lanUrls: string[]
	/** All reachable endpoints, typed (loopback, LAN, Tailscale), best-first. */
	endpoints: RemoteEndpoint[]
	/** The port the OpenCode server is listening on, or null. */
	port: number | null
}

/** Collect non-internal IPv4 addresses for this host. */
function hostAddresses(): string[] {
	const addrs: string[] = []
	const ifaces = os.networkInterfaces()
	for (const name of Object.keys(ifaces)) {
		for (const info of ifaces[name] ?? []) {
			if (info.family !== "IPv4" || info.internal) continue
			addrs.push(info.address)
		}
	}
	return addrs
}

function serverHostname(url: string): string | null {
	try {
		return new URL(url).hostname
	} catch {
		return null
	}
}

function isLoopbackHost(hostname: string | null): boolean {
	return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1"
}

function endpointAddresses(url: string): string[] {
	const hostname = serverHostname(url)
	if (!hostname || hostname === "0.0.0.0" || hostname === "::") {
		return hostAddresses()
	}
	if (isLoopbackHost(hostname)) {
		return []
	}
	return [hostname]
}

/**
 * Describe how to reach the running OpenCode server from another device
 * (a laptop's GCode, the web build, or a phone browser). Endpoints are typed
 * and sorted best-first so the UI can highlight the most useful address.
 */
export function getRemoteAccessInfo(): RemoteAccessInfo {
	const url = getProjectRuntimeUrl()
	if (!url) {
		return { url: null, lanUrls: [], endpoints: [], port: null }
	}

	const port = parsePort(url)
	const endpoints = buildEndpoints(port, endpointAddresses(url))
	const lanUrls = endpoints.filter((e) => e.type !== "loopback").map((e) => e.url)

	log.info("Remote access info", {
		port,
		lanCount: lanUrls.length,
		tailscale: endpoints.some((e) => e.type === "tailscale"),
	})
	return { url, lanUrls, endpoints, port }
}
