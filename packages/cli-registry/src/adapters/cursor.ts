import type { CliAdapter } from "../types"

/**
 * Cursor Agent — Cursor's headless coding CLI (`cursor-agent`). Session
 * credentials live under `~/.cursor` / `~/.config/cursor`.
 */
export const cursorAdapter: CliAdapter = {
	id: "cursor",
	displayName: "Cursor Agent",
	binaries: ["cursor-agent"],
	versionArgs: ["--version"],
	authPaths: ["~/.cursor/cli-config.json", "~/.config/cursor/cli-config.json"],
	docsUrl: "https://docs.cursor.com/en/cli/overview",
	installHint: "curl https://cursor.com/install -fsS | bash",
	managed: false,
}
