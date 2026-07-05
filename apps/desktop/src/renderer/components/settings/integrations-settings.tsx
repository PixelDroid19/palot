import { Button } from "@palot/ui/components/button"
import { Input } from "@palot/ui/components/input"
import { Switch } from "@palot/ui/components/switch"
import {
	CheckCircle2Icon,
	CopyIcon,
	Loader2Icon,
	RefreshCwIcon,
	SmartphoneIcon,
	TerminalIcon,
	XCircleIcon,
} from "lucide-react"
import QRCode from "qrcode"
import { useCallback, useEffect, useState } from "react"
import { SubagentPanel } from "./subagent-panel"
import type {
	AgentCliDetection,
	MigrationProvider,
	MigrationResult,
	RemoteAccessInfo,
	RemoteEndpoint,
	WebhookTarget,
} from "../../../preload/api"
import { useSettings } from "../../hooks/use-settings"
import { SettingsRow } from "./settings-row"
import { SettingsSection } from "./settings-section"

const isElectron = typeof window !== "undefined" && "palot" in window

// ============================================================
// Webhooks (Feishu / WeChat / generic)
// ============================================================

function WebhookField({
	label,
	description,
	value,
	placeholder,
	onCommit,
	target,
}: {
	label: string
	description: string
	value: string
	placeholder: string
	onCommit: (value: string) => void
	target: WebhookTarget
}) {
	const [draft, setDraft] = useState(value)
	const [testing, setTesting] = useState(false)
	const [result, setResult] = useState<"ok" | "fail" | null>(null)

	useEffect(() => setDraft(value), [value])

	const handleTest = useCallback(async () => {
		if (!isElectron) return
		setTesting(true)
		setResult(null)
		try {
			const r = await window.palot.webhooks.test(target)
			setResult(r.success ? "ok" : "fail")
		} finally {
			setTesting(false)
		}
	}, [target])

	return (
		<div className="flex flex-col gap-2 px-4 py-3">
			<div className="flex flex-col gap-0.5">
				<span className="text-sm font-medium">{label}</span>
				<span className="text-sm text-muted-foreground">{description}</span>
			</div>
			<div className="flex items-center gap-2">
				<Input
					value={draft}
					placeholder={placeholder}
					onChange={(e) => setDraft(e.target.value)}
					onBlur={() => draft !== value && onCommit(draft)}
				/>
				<Button
					variant="outline"
					size="sm"
					onClick={handleTest}
					disabled={testing || !draft.trim()}
				>
					{testing ? (
						<Loader2Icon aria-hidden="true" className="size-4 animate-spin" />
					) : result === "ok" ? (
						<CheckCircle2Icon aria-hidden="true" className="size-4 text-green-500" />
					) : result === "fail" ? (
						<XCircleIcon aria-hidden="true" className="size-4 text-destructive" />
					) : null}
					Test
				</Button>
			</div>
		</div>
	)
}

// ============================================================
// SSH skill sync
// ============================================================

function SkillSyncPanel() {
	const { settings, updateSettings } = useSettings()
	const cfg = settings.skillSync
	const [host, setHost] = useState(cfg.host)
	const [remotePath, setRemotePath] = useState(cfg.remotePath)
	const [port, setPort] = useState(String(cfg.port))
	const [busy, setBusy] = useState<"push" | "pull" | null>(null)
	const [output, setOutput] = useState<string | null>(null)
	const [ok, setOk] = useState<boolean | null>(null)

	useEffect(() => {
		setHost(cfg.host)
		setRemotePath(cfg.remotePath)
		setPort(String(cfg.port))
	}, [cfg.host, cfg.remotePath, cfg.port])

	const commit = useCallback(() => {
		updateSettings({
			skillSync: { host, remotePath, port: Number.parseInt(port, 10) || 22 },
		})
	}, [host, remotePath, port, updateSettings])

	const sync = useCallback(
		async (direction: "push" | "pull") => {
			if (!isElectron) return
			commit()
			setBusy(direction)
			setOutput(null)
			setOk(null)
			try {
				const r = await window.palot.skills.sync(direction)
				setOk(r.success)
				setOutput(r.error ? `${r.error}\n${r.output}` : r.output || "Done.")
			} finally {
				setBusy(null)
			}
		},
		[commit],
	)

	return (
		<SettingsSection
			title="SSH skill sync"
			description="Sync your user-level OpenCode skills (~/.config/opencode/skills) to or from a remote host over SSH. Requires rsync and ssh with key-based auth."
		>
			<div className="flex flex-col gap-3 px-4 py-3">
				<Input
					value={host}
					placeholder="user@host"
					onChange={(e) => setHost(e.target.value)}
					onBlur={commit}
				/>
				<div className="flex gap-2">
					<Input
						value={remotePath}
						placeholder="/remote/path/to/skills"
						onChange={(e) => setRemotePath(e.target.value)}
						onBlur={commit}
					/>
					<Input
						value={port}
						placeholder="22"
						className="w-20"
						onChange={(e) => setPort(e.target.value)}
						onBlur={commit}
					/>
				</div>
				<div className="flex gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={() => sync("push")}
						disabled={busy !== null || !host.trim()}
					>
						{busy === "push" && (
							<Loader2Icon aria-hidden="true" className="size-4 animate-spin" />
						)}
						Push to remote
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={() => sync("pull")}
						disabled={busy !== null || !host.trim()}
					>
						{busy === "pull" && (
							<Loader2Icon aria-hidden="true" className="size-4 animate-spin" />
						)}
						Pull from remote
					</Button>
				</div>
				{output !== null && (
					<pre
						className={`max-h-40 overflow-auto rounded-md border p-2 text-xs ${
							ok ? "border-border text-muted-foreground" : "border-destructive/40 text-destructive"
						}`}
					>
						{output}
					</pre>
				)}
			</div>
		</SettingsSection>
	)
}

// ============================================================
// Remote / mobile access
// ============================================================

/** Renders a scannable QR code for a URL as a data-URI image (CSP-safe). */
function QrCode({ url }: { url: string }) {
	const [src, setSrc] = useState<string | null>(null)

	useEffect(() => {
		let cancelled = false
		QRCode.toDataURL(url, { margin: 1, width: 176, errorCorrectionLevel: "M" })
			.then((dataUrl) => {
				if (!cancelled) setSrc(dataUrl)
			})
			.catch(() => {
				if (!cancelled) setSrc(null)
			})
		return () => {
			cancelled = true
		}
	}, [url])

	if (!src) return <div className="size-44 rounded-md bg-muted" aria-hidden="true" />
	return (
		<img
			src={src}
			alt={`QR code for ${url}`}
			className="size-44 rounded-md bg-white p-2"
			width={176}
			height={176}
		/>
	)
}

function RemoteAccessPanel() {
	const [info, setInfo] = useState<RemoteAccessInfo | null>(null)
	const [loading, setLoading] = useState(false)
	const [copied, setCopied] = useState<string | null>(null)
	const [selected, setSelected] = useState<string | null>(null)

	const load = useCallback(async () => {
		if (!isElectron) return
		setLoading(true)
		try {
			const next = await window.palot.getRemoteAccessInfo()
			setInfo(next)
			// Default to the best (first) non-loopback endpoint for the QR code.
			const best = next.endpoints.find((e) => e.type !== "loopback")
			setSelected((prev) =>
				prev && next.endpoints.some((e) => e.url === prev) ? prev : (best?.url ?? null),
			)
		} finally {
			setLoading(false)
		}
	}, [])

	useEffect(() => {
		load()
	}, [load])

	const copy = useCallback((url: string) => {
		navigator.clipboard.writeText(url)
		setCopied(url)
		setTimeout(() => setCopied(null), 1500)
	}, [])

	const endpoints: RemoteEndpoint[] = info?.endpoints.filter((e) => e.type !== "loopback") ?? []
	const hasTailscale = endpoints.some((e) => e.type === "tailscale")

	return (
		<SettingsSection
			title="Remote & mobile access"
			description="Connect another device (a laptop's Palot, the web build, or a phone browser) to this machine's running OpenCode server. Scan the QR code from a phone on the same network — or via Tailscale from anywhere."
		>
			<div className="flex items-center justify-between px-4 py-3">
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<SmartphoneIcon aria-hidden="true" className="size-4" />
					{info?.port ? `Server listening on port ${info.port}` : "Server not running"}
				</div>
				<Button variant="outline" size="sm" onClick={load} disabled={loading}>
					{loading ? (
						<Loader2Icon aria-hidden="true" className="size-4 animate-spin" />
					) : (
						<RefreshCwIcon aria-hidden="true" className="size-4" />
					)}
					Refresh
				</Button>
			</div>

			{endpoints.length > 0 ? (
				<div className="flex flex-col gap-4 px-4 py-3 sm:flex-row sm:items-start">
					{selected && (
						<div className="flex flex-col items-center gap-2">
							<QrCode url={selected} />
							<span className="text-xs text-muted-foreground">Scan to connect</span>
						</div>
					)}
					<div className="flex min-w-0 flex-1 flex-col gap-1">
						{endpoints.map((ep) => (
							<button
								type="button"
								key={ep.url}
								onClick={() => setSelected(ep.url)}
								className={`flex items-center justify-between gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted ${
									selected === ep.url ? "bg-muted" : ""
								}`}
							>
								<span className="flex min-w-0 flex-col">
									<span className="flex items-center gap-2">
										<span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
											{ep.label}
										</span>
									</span>
									<span className="truncate font-mono text-sm">{ep.url}</span>
								</span>
								<Button
									variant="ghost"
									size="sm"
									onClick={(e) => {
										e.stopPropagation()
										copy(ep.url)
									}}
								>
									{copied === ep.url ? (
										<CheckCircle2Icon aria-hidden="true" className="size-4 text-green-500" />
									) : (
										<CopyIcon aria-hidden="true" className="size-4" />
									)}
								</Button>
							</button>
						))}
						{!hasTailscale && (
							<p className="mt-1 text-xs text-muted-foreground">
								Tip: install Tailscale to get a stable address that works from anywhere, not just
								the local network.
							</p>
						)}
					</div>
				</div>
			) : (
				info && (
					<p className="px-4 py-3 text-sm text-muted-foreground">
						No reachable addresses detected. Make sure the server is running and you're connected to
						a network.
					</p>
				)
			)}
		</SettingsSection>
	)
}

// ============================================================
// Agent CLI detection
// ============================================================

const AUTH_LABEL: Record<AgentCliDetection["auth"], string> = {
	authenticated: "Signed in",
	unauthenticated: "Not signed in",
	unknown: "",
}

/**
 * Map a detected CLI to the migration source provider understood by the
 * onboarding/config-migration system. Only CLIs with a supported config
 * migration path to OpenCode appear here.
 */
const MIGRATION_PROVIDER: Partial<Record<AgentCliDetection["id"], MigrationProvider>> = {
	claude: "claude-code",
	cursor: "cursor",
}

// The convert step ports every category present in the scan; `categories`
// primarily gates history import. Passing the full set migrates everything.
const ALL_MIGRATION_CATEGORIES = [
	"config",
	"mcp",
	"history",
	"agents",
	"commands",
	"rules",
	"permissions",
	"hooks",
	"skills",
]

type MigrateState =
	| { status: "idle" }
	| { status: "confirm" }
	| { status: "running" }
	| { status: "done"; result: MigrationResult }
	| { status: "error"; message: string }

function AgentCliRow({ cli }: { cli: AgentCliDetection }) {
	const provider = MIGRATION_PROVIDER[cli.id]
	const [migrate, setMigrate] = useState<MigrateState>({ status: "idle" })

	const runMigration = useCallback(async () => {
		if (!isElectron || !provider) return
		setMigrate({ status: "running" })
		try {
			const { scanResult } = await window.palot.onboarding.scanProvider(provider)
			const result = await window.palot.onboarding.executeMigration(
				provider,
				scanResult,
				ALL_MIGRATION_CATEGORIES,
			)
			setMigrate({ status: "done", result })
		} catch (err) {
			setMigrate({
				status: "error",
				message: err instanceof Error ? err.message : "Migration failed",
			})
		}
	}, [provider])

	const canMigrate = !!provider && cli.installed

	return (
		<div className="flex flex-col gap-2 px-4 py-3">
			<div className="flex items-center justify-between gap-3">
				<div className="flex min-w-0 flex-col gap-0.5">
					<div className="flex items-center gap-2">
						{cli.installed ? (
							<CheckCircle2Icon aria-hidden="true" className="size-4 shrink-0 text-green-500" />
						) : (
							<XCircleIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
						)}
						<span className="font-medium">{cli.displayName}</span>
						{cli.managed && (
							<span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
								Managed
							</span>
						)}
						{cli.installed && cli.version && (
							<span className="font-mono text-xs text-muted-foreground">v{cli.version}</span>
						)}
					</div>
					<span className="truncate text-xs text-muted-foreground">
						{cli.installed ? (
							<>
								{AUTH_LABEL[cli.auth]}
								{cli.auth !== "unknown" && cli.binaryPath ? " · " : ""}
								<span className="font-mono">{cli.binaryPath}</span>
							</>
						) : (
							<span className="font-mono">{cli.installHint}</span>
						)}
					</span>
				</div>
				<div className="flex shrink-0 items-center gap-3">
					{canMigrate &&
						(migrate.status === "idle" ? (
							<Button variant="outline" size="sm" onClick={() => setMigrate({ status: "confirm" })}>
								Migrate to OpenCode
							</Button>
						) : migrate.status === "confirm" ? (
							<div className="flex items-center gap-1">
								<Button variant="ghost" size="sm" onClick={() => setMigrate({ status: "idle" })}>
									Cancel
								</Button>
								<Button variant="default" size="sm" onClick={runMigration}>
									Confirm
								</Button>
							</div>
						) : migrate.status === "running" ? (
							<span className="flex items-center gap-1.5 text-sm text-muted-foreground">
								<Loader2Icon aria-hidden="true" className="size-4 animate-spin" />
								Migrating…
							</span>
						) : null)}
					<a
						href={cli.docsUrl}
						target="_blank"
						rel="noreferrer"
						className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
					>
						Docs
					</a>
				</div>
			</div>

			{migrate.status === "confirm" && (
				<p className="text-xs text-muted-foreground">
					Imports {cli.displayName}'s config (settings, MCP servers, agents, commands, rules,
					sessions) into OpenCode. Existing files are preserved and a backup is created — you can
					undo it from the Setup tab.
				</p>
			)}
			{migrate.status === "done" && (
				<p className="text-xs text-green-600 dark:text-green-500">
					Migrated {migrate.result.filesWritten.length} file
					{migrate.result.filesWritten.length === 1 ? "" : "s"} to OpenCode
					{migrate.result.errors.length > 0
						? ` · ${migrate.result.errors.length} error(s)`
						: ""}
					{migrate.result.backupDir ? " · backup created" : ""}. Restart the OpenCode server to
					load the imported config.
				</p>
			)}
			{migrate.status === "error" && (
				<p className="text-xs text-destructive">{migrate.message}</p>
			)}
		</div>
	)
}

function AgentClisPanel() {
	const [clis, setClis] = useState<AgentCliDetection[] | null>(null)
	const [loading, setLoading] = useState(false)

	const load = useCallback(async (force = false) => {
		if (!isElectron) return
		setLoading(true)
		try {
			setClis(await window.palot.agentClis.detect(force))
		} finally {
			setLoading(false)
		}
	}, [])

	useEffect(() => {
		load()
	}, [load])

	return (
		<SettingsSection
			title="Coding CLIs"
			description="Palot works with multiple coding-agent CLIs. These are detected on this machine — OpenCode runs as a managed backend today; the others are recognized for config migration and quick access."
		>
			<div className="flex items-center justify-between px-4 py-3">
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<TerminalIcon aria-hidden="true" className="size-4" />
					{clis
						? `${clis.filter((c) => c.installed).length} of ${clis.length} installed`
						: "Detecting…"}
				</div>
				<Button variant="outline" size="sm" onClick={() => load(true)} disabled={loading}>
					{loading ? (
						<Loader2Icon aria-hidden="true" className="size-4 animate-spin" />
					) : (
						<RefreshCwIcon aria-hidden="true" className="size-4" />
					)}
					Rescan
				</Button>
			</div>
			{clis?.map((cli) => <AgentCliRow key={cli.id} cli={cli} />)}
		</SettingsSection>
	)
}

// ============================================================
// Page
// ============================================================

export function IntegrationsSettings() {
	const { settings, updateSettings } = useSettings()
	const w = settings.webhooks

	const updateWebhooks = useCallback(
		(partial: Record<string, unknown>) => {
			updateSettings({ webhooks: partial })
		},
		[updateSettings],
	)

	return (
		<div className="space-y-8">
			<div>
				<h2 className="text-xl font-semibold">Integrations</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					Work with your other coding CLIs, push agent events to chat bots, sync skills across
					machines, and connect from other devices.
				</p>
			</div>

			<SettingsSection
				title="Bot notifications"
				description="Forward agent events (completion, permissions, questions, errors) to Feishu, WeChat Work, or a generic webhook."
			>
				<SettingsRow label="Enable webhooks" description="Master switch for all bot notifications">
					<Switch
						checked={w.enabled}
						onCheckedChange={(v) => updateWebhooks({ enabled: v })}
					/>
				</SettingsRow>
				<WebhookField
					label="Feishu (Lark)"
					description="Custom-bot incoming webhook URL"
					target="feishu"
					value={w.feishuUrl}
					placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/…"
					onCommit={(v) => updateWebhooks({ feishuUrl: v })}
				/>
				<WebhookField
					label="WeChat Work"
					description="Group-robot webhook URL"
					target="wechat"
					value={w.wechatUrl}
					placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=…"
					onCommit={(v) => updateWebhooks({ wechatUrl: v })}
				/>
				<WebhookField
					label="Generic webhook"
					description="Any endpoint that accepts a JSON POST"
					target="generic"
					value={w.genericUrl}
					placeholder="https://example.com/webhook"
					onCommit={(v) => updateWebhooks({ genericUrl: v })}
				/>
				<SettingsRow label="Completion events" description="Notify when an agent finishes">
					<Switch
						checked={w.events.completion}
						onCheckedChange={(v) => updateWebhooks({ events: { completion: v } })}
					/>
				</SettingsRow>
				<SettingsRow label="Permission events" description="Notify when approval is needed">
					<Switch
						checked={w.events.permissions}
						onCheckedChange={(v) => updateWebhooks({ events: { permissions: v } })}
					/>
				</SettingsRow>
				<SettingsRow label="Question events" description="Notify when the agent asks a question">
					<Switch
						checked={w.events.questions}
						onCheckedChange={(v) => updateWebhooks({ events: { questions: v } })}
					/>
				</SettingsRow>
				<SettingsRow label="Error events" description="Notify on agent errors">
					<Switch
						checked={w.events.errors}
						onCheckedChange={(v) => updateWebhooks({ events: { errors: v } })}
					/>
				</SettingsRow>
			</SettingsSection>

			<AgentClisPanel />
			<SubagentPanel />
			<SkillSyncPanel />
			<RemoteAccessPanel />
		</div>
	)
}
