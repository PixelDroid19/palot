import os from "node:os"
import { createLogger } from "./logger"
import { getServerUrl } from "./opencode-manager"

const log = createLogger("remote-access")

/** How a reachable endpoint should be understood by the user. */
export type EndpointType = "loopback" | "lan" | "tailscale"

export interface RemoteEndpoint {
	url: string
	type: EndpointType
	/** Human-readable label, e.g. "LAN" or "Tailscale". */
	label: string
}

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

/**
 * Tailscale assigns addresses from the 100.64.0.0/10 CGNAT range. Detecting it
 * lets us surface a stable remote address that survives moving between networks.
 */
function isTailscaleAddress(ip: string): boolean {
	const parts = ip.split(".").map((p) => Number.parseInt(p, 10))
	if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false
	const [a, b] = parts
	return a === 100 && b >= 64 && b <= 127
}

interface HostAddress {
	address: string
	type: EndpointType
}

/** Collect non-internal IPv4 addresses for this host, classified by type. */
function hostAddresses(): HostAddress[] {
	const addrs: HostAddress[] = []
	const ifaces = os.networkInterfaces()
	for (const name of Object.keys(ifaces)) {
		for (const info of ifaces[name] ?? []) {
			if (info.family !== "IPv4" || info.internal) continue
			addrs.push({
				address: info.address,
				type: isTailscaleAddress(info.address) ? "tailscale" : "lan",
			})
		}
	}
	return addrs
}

const TYPE_LABEL: Record<EndpointType, string> = {
	loopback: "This machine",
	lan: "LAN",
	tailscale: "Tailscale",
}

// Tailscale first — it's the most stable across networks — then LAN, then loopback.
const TYPE_RANK: Record<EndpointType, number> = { tailscale: 0, lan: 1, loopback: 2 }

/**
 * Describe how to reach the running OpenCode server from another device
 * (a laptop's Palot, the web build, or a phone browser). Endpoints are typed
 * and sorted best-first so the UI can highlight the most useful address.
 */
export function getRemoteAccessInfo(): RemoteAccessInfo {
	const url = getServerUrl()
	if (!url) {
		return { url: null, lanUrls: [], endpoints: [], port: null }
	}

	let port: number | null = null
	try {
		port = Number.parseInt(new URL(url).port, 10) || null
	} catch {
		port = null
	}

	const endpoints: RemoteEndpoint[] = []
	if (port) {
		for (const { address, type } of hostAddresses()) {
			endpoints.push({ url: `http://${address}:${port}`, type, label: TYPE_LABEL[type] })
		}
	}
	endpoints.sort((a, b) => TYPE_RANK[a.type] - TYPE_RANK[b.type])

	const lanUrls = endpoints.filter((e) => e.type !== "loopback").map((e) => e.url)
	log.info("Remote access info", {
		port,
		lanCount: lanUrls.length,
		tailscale: endpoints.some((e) => e.type === "tailscale"),
	})
	return { url, lanUrls, endpoints, port }
}
