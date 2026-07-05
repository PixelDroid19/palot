/**
 * Types describing coding-agent CLIs that Palot can detect and work with.
 *
 * Palot is not tied to a single agent runtime. A {@link CliAdapter} is a small,
 * declarative description of one coding-agent CLI (its binary, how to read its
 * version, where it keeps auth, and how to install it). The registry detects
 * which of these are actually available on the host so the rest of the app can
 * offer, launch, or migrate between them.
 */

/** Stable identifier for a supported coding-agent CLI. */
export type CliId = "opencode" | "claude" | "codex" | "cursor" | "gemini"

/** Whether a CLI is signed in, and how confidently we can tell. */
export type AuthState = "authenticated" | "unauthenticated" | "unknown"

/**
 * Declarative description of a coding-agent CLI. Adapters hold no host state;
 * they are pure data plus small pure helpers, which makes them trivial to test
 * and safe to share across processes.
 */
export interface CliAdapter {
	/** Stable identifier, e.g. "opencode". */
	id: CliId
	/** Human-readable name, e.g. "OpenCode". */
	displayName: string
	/**
	 * Executable names to probe on the PATH, in preference order. The first one
	 * found wins. Some CLIs ship under more than one name across versions.
	 */
	binaries: string[]
	/** Arguments that make the binary print its version and exit. */
	versionArgs: string[]
	/**
	 * Extract a semver-ish version string from the raw `--version` output.
	 * Defaults to the first `x.y.z` match when omitted.
	 */
	parseVersion?: (raw: string) => string | null
	/**
	 * Absolute paths (with `~` allowed) that indicate the CLI is authenticated
	 * when any of them exists. Used as a best-effort, side-effect-free check.
	 */
	authPaths?: string[]
	/** Documentation URL for the CLI. */
	docsUrl: string
	/** One-line install hint shown when the CLI is missing. */
	installHint: string
	/**
	 * Whether Palot can drive this CLI as a managed backend today. Detection is
	 * offered for every adapter; `managed` marks first-class runtime support.
	 */
	managed: boolean
}

/** Result of probing a single CLI on the host. */
export interface CliDetection {
	id: CliId
	displayName: string
	docsUrl: string
	installHint: string
	managed: boolean
	/** True when a matching binary was found on the PATH. */
	installed: boolean
	/** Absolute path to the resolved binary, or null when not installed. */
	binaryPath: string | null
	/** Parsed version string, or null when unknown. */
	version: string | null
	/** Best-effort auth state derived from known credential paths. */
	auth: AuthState
}

/**
 * Host-facing primitives the registry needs. Injected so the pure detection
 * logic can be exercised in tests with fakes and against the real system in
 * integration tests.
 */
export interface DetectionHost {
	/** Resolve a binary name to an absolute path, or null if not on PATH. */
	which: (binary: string) => Promise<string | null>
	/** Run a binary with args, returning combined stdout+stderr (never throws). */
	run: (binary: string, args: string[]) => Promise<string>
	/** True when a filesystem path exists. `~` is expanded to the home dir. */
	pathExists: (path: string) => boolean
}
