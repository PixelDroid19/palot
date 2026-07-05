/**
 * Pure helpers for classifying and ordering the network endpoints a device can
 * use to reach the local OpenCode server. Kept free of Electron/Node host APIs
 * so the logic is unit-testable; callers supply the raw addresses and port.
 */

/** How a reachable endpoint should be understood by the user. */
export type EndpointType = "loopback" | "lan" | "tailscale"

export interface RemoteEndpoint {
	url: string
	type: EndpointType
	/** Human-readable label, e.g. "LAN" or "Tailscale". */
	label: string
}

const TYPE_LABEL: Record<EndpointType, string> = {
	loopback: "This machine",
	lan: "LAN",
	tailscale: "Tailscale",
}

// Tailscale first — it's the most stable across networks — then LAN, then loopback.
const TYPE_RANK: Record<EndpointType, number> = { tailscale: 0, lan: 1, loopback: 2 }

/**
 * Tailscale assigns addresses from the 100.64.0.0/10 CGNAT range. Detecting it
 * lets us surface a stable remote address that survives moving between networks.
 */
export function isTailscaleAddress(ip: string): boolean {
	const parts = ip.split(".").map((p) => Number.parseInt(p, 10))
	if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false
	const [a, b] = parts
	return a === 100 && b >= 64 && b <= 127
}

/** Classify a non-internal IPv4 address as a Tailscale or plain LAN address. */
export function classifyAddress(ip: string): EndpointType {
	return isTailscaleAddress(ip) ? "tailscale" : "lan"
}

/** Extract the port from a server URL, or null when it can't be determined. */
export function parsePort(url: string): number | null {
	try {
		return Number.parseInt(new URL(url).port, 10) || null
	} catch {
		return null
	}
}

/**
 * Build typed, best-first endpoints from a set of host addresses and a port.
 * Returns an empty list when there is no port. Input order does not matter;
 * results are sorted Tailscale → LAN → loopback.
 */
export function buildEndpoints(port: number | null, addresses: string[]): RemoteEndpoint[] {
	if (!port) return []
	const endpoints: RemoteEndpoint[] = addresses.map((address) => {
		const type = classifyAddress(address)
		return { url: `http://${address}:${port}`, type, label: TYPE_LABEL[type] }
	})
	endpoints.sort((a, b) => TYPE_RANK[a.type] - TYPE_RANK[b.type])
	return endpoints
}
