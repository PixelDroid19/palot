import type { CliAdapter } from "../types"

/**
 * Claude Code — Anthropic's official coding CLI. Credentials are stored either
 * in `~/.claude/.credentials.json` (API key / OAuth) or inline in the legacy
 * `~/.claude.json` profile.
 */
export const claudeAdapter: CliAdapter = {
	id: "claude",
	displayName: "Claude Code",
	binaries: ["claude"],
	versionArgs: ["--version"],
	authPaths: ["~/.claude/.credentials.json", "~/.claude.json"],
	docsUrl: "https://docs.claude.com/en/docs/claude-code",
	installHint: "npm install -g @anthropic-ai/claude-code",
	managed: false,
}
