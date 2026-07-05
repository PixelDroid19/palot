import { Button } from "@palot/ui/components/button"
import { Input } from "@palot/ui/components/input"
import { Switch } from "@palot/ui/components/switch"
import {
	CheckCircle2Icon,
	CopyIcon,
	Loader2Icon,
	RefreshCwIcon,
	SmartphoneIcon,
	XCircleIcon,
} from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import type { RemoteAccessInfo, WebhookTarget } from "../../../preload/api"
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

function RemoteAccessPanel() {
	const [info, setInfo] = useState<RemoteAccessInfo | null>(null)
	const [loading, setLoading] = useState(false)
	const [copied, setCopied] = useState<string | null>(null)

	const load = useCallback(async () => {
		if (!isElectron) return
		setLoading(true)
		try {
			setInfo(await window.palot.getRemoteAccessInfo())
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

	return (
		<SettingsSection
			title="Remote & mobile access"
			description="Connect another device (a laptop's Palot, the web build, or a phone browser) on the same network to this machine's running OpenCode server."
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
			{info && info.lanUrls.length > 0
				? info.lanUrls.map((url) => (
						<div key={url} className="flex items-center justify-between gap-2 px-4 py-3">
							<span className="truncate font-mono text-sm">{url}</span>
							<Button variant="ghost" size="sm" onClick={() => copy(url)}>
								{copied === url ? (
									<CheckCircle2Icon aria-hidden="true" className="size-4 text-green-500" />
								) : (
									<CopyIcon aria-hidden="true" className="size-4" />
								)}
							</Button>
						</div>
					))
				: info && (
						<p className="px-4 py-3 text-sm text-muted-foreground">
							No LAN addresses detected. Make sure the server is running and you're connected to a
							network.
						</p>
					)}
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
					Push agent events to chat bots, sync skills across machines, and connect from other
					devices.
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

			<SkillSyncPanel />
			<RemoteAccessPanel />
		</div>
	)
}
