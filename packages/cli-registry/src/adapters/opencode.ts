import type { CliAdapter } from "../types"

/**
 * OpenCode — a first-class CLI runtime driven through `opencode acp`. Its auth
 * lives in an `auth.json` under the platform data/config dir.
 */
export const opencodeAdapter: CliAdapter = {
	id: "opencode",
	displayName: "OpenCode",
	// Some distro packages install the binary as `opencode-cli` (#107).
	binaries: ["opencode", "opencode-cli"],
	versionArgs: ["--version"],
	authPaths: [
		"~/.local/share/opencode/auth.json",
		"~/.config/opencode/auth.json",
		"~/Library/Application Support/opencode/auth.json",
	],
	docsUrl: "https://opencode.ai/docs",
	installHint: "curl -fsSL https://opencode.ai/install | bash",
	managed: false,
}
