/**
 * Automations — list, create, run, inbox (runs) via services/backend.ts.
 */
import { html, LitElement } from "lit"
import { customElement, state } from "lit/decorators.js"
import type { Automation, AutomationRun } from "../../../preload/api"
import {
	createAutomation,
	fetchAutomationRuns,
	fetchAutomations,
	markAutomationRunRead,
} from "../../services/backend"
import { LocaleController } from "../locale-controller"
import { navigate } from "../router"
import { styles } from "./gcode-automations.css.js"
import "./gcode-markdown"

@customElement("gcode-automations")
export class GcodeAutomations extends LitElement {
	static styles = styles
	private locale = new LocaleController(this)

	@state() private items: Automation[] = []
	@state() private runs: AutomationRun[] = []
	@state() private error = ""
	@state() private loading = true
	@state() private showCreate = false
	@state() private name = ""
	@state() private prompt = ""
	@state() private workspace = ""
	@state() private creating = false
	@state() private selectedRunId: string | null = null
	@state() private bannerDismissed = false

	connectedCallback(): void {
		super.connectedCallback()
		this.bannerDismissed = localStorage.getItem("gcode:automationsBannerDismissed") === "true"
		void this.reload()
	}

	private dismissBanner(): void {
		this.bannerDismissed = true
		localStorage.setItem("gcode:automationsBannerDismissed", "true")
	}

	private async reload(): Promise<void> {
		this.loading = true
		this.error = ""
		try {
			const [items, runs] = await Promise.all([fetchAutomations(), fetchAutomationRuns()])
			this.items = items
			this.runs = runs
		} catch (err) {
			this.error = err instanceof Error ? err.message : String(err)
			this.items = []
			this.runs = []
		} finally {
			this.loading = false
		}
	}

	private async create(): Promise<void> {
		const name = this.name.trim()
		const prompt = this.prompt.trim()
		if (!name || !prompt) {
			this.error = this.locale.t("litAutomations.createRequired")
			return
		}
		this.creating = true
		this.error = ""
		try {
			const workspaces = this.workspace.trim() ? [this.workspace.trim()] : []
			await createAutomation({
				name,
				prompt,
				schedule: { rrule: "FREQ=DAILY;INTERVAL=1", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
				workspaces,
			})
			this.name = ""
			this.prompt = ""
			this.workspace = ""
				this.showCreate = false
			await this.reload()
		} catch (err) {
			this.error = err instanceof Error ? err.message : String(err)
		} finally {
			this.creating = false
		}
	}

	private async markRead(runId: string): Promise<void> {
		try {
			await markAutomationRunRead(runId)
			await this.reload()
		} catch (err) {
			this.error = err instanceof Error ? err.message : String(err)
		}
	}

	private selectRun(run: AutomationRun): void {
		this.selectedRunId = run.id
		this.showCreate = false
		if (!run.readAt) void this.markRead(run.id)
	}

	private projectLabel(workspace: string): string | null {
		if (!workspace) return null
		return workspace.split("/").pop() ?? null
	}

	private formatTimeAgo(timestamp: number): string {
		const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000))
		if (seconds < 60) return "now"
		const minutes = Math.round(seconds / 60)
		if (minutes < 60) return `${minutes}m`
		const hours = Math.round(minutes / 60)
		if (hours < 24) return `${hours}h`
		return `${Math.round(hours / 24)}d`
	}

	private formatTimeUntil(timestamp: number): string {
		const seconds = Math.max(0, Math.round((timestamp - Date.now()) / 1000))
		if (seconds < 60) return "less than 1m"
		const minutes = Math.round(seconds / 60)
		if (minutes < 60) return `${minutes}m`
		const hours = Math.round(minutes / 60)
		if (hours < 24) return `${hours}h`
		return `${Math.round(hours / 24)}d`
	}

	private renderSectionHeader(label: string) {
		return html`<div class="section-header"><span>${label}</span></div>`
	}

	private renderAutomationRow(automation: Automation) {
		const projectLabel = automation.workspaces
			.map((workspace) => this.projectLabel(workspace))
			.filter(Boolean)
			.join(", ")
		const countdown = automation.nextRunAt
			? `Starts in ${this.formatTimeUntil(automation.nextRunAt)}`
			: automation.status === "paused"
				? "Paused"
				: null
		return html`
			<button
				type="button"
				class="row automation-row"
				data-paused=${String(automation.status === "paused")}
				@click=${() => navigate(`/automations/${automation.id}`)}
			>
				<span class="status-icon ${automation.status === "active" ? "active" : "paused"}" aria-hidden="true">
					${automation.status === "paused"
						? html`<svg viewBox="0 0 16 16"><path d="M5 3.5v9M11 3.5v9" /></svg>`
						: html`<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="3.25" /></svg>`}
				</span>
				<span class="row-main">
					<span class="row-title">${automation.name || automation.id}</span>
					${projectLabel ? html`<span class="row-project">${projectLabel}</span>` : null}
				</span>
				${countdown ? html`<span class="row-tail">${countdown}</span>` : null}
			</button>
		`
	}

	private renderRunRow(run: AutomationRun) {
		const automation = this.items.find((item) => item.id === run.automationId)
		const projectLabel = this.projectLabel(run.workspace)
		const summary = run.resultSummary ?? run.resultTitle
		const isUnread = run.readAt === null && run.status === "pending_review"
		const isRunning = run.status === "running" || run.status === "queued"
		return html`
			<button
				type="button"
				class="row run-row"
				data-active=${String(run.id === this.selectedRunId)}
				@click=${() => this.selectRun(run)}
			>
				<span class="status-icon ${isRunning ? "running" : isUnread ? "unread" : "complete"}" aria-hidden="true">
					${isRunning
						? html`<svg viewBox="0 0 16 16"><path d="M8 2.5a5.5 5.5 0 1 1-3.89 1.61" /></svg>`
						: isUnread
							? html`<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="3.25" /></svg>`
							: html`<svg viewBox="0 0 16 16"><path d="m4.5 8.2 2.1 2.1 4.9-4.9" /></svg>`}
				</span>
				<span class="row-main">
					<span class="row-title">${automation?.name ?? "Unknown"}</span>
					${projectLabel ? html`<span class="row-project">${projectLabel}</span>` : null}
					${summary ? html`<span class="row-summary">${summary}</span>` : null}
				</span>
				<span class="row-tail">${this.formatTimeAgo(run.createdAt)}</span>
			</button>
		`
	}

	private renderList() {
		if (this.loading) return html`<div class="empty">…</div>`
		const scheduled = this.items
			.filter((item) => item.status === "active" || item.status === "paused")
			.sort((a, b) => (a.nextRunAt ?? Infinity) - (b.nextRunAt ?? Infinity))
		const completed = this.runs.filter((run) => run.status !== "archived").sort((a, b) => b.createdAt - a.createdAt)
		const archived = this.runs.filter((run) => run.status === "archived").sort((a, b) => b.createdAt - a.createdAt)
		if (scheduled.length === 0 && completed.length === 0 && archived.length === 0) {
			return html`<div class="empty">${this.locale.t("litAutomations.empty")}</div>`
		}
		return html`
			<div class="list">
				${scheduled.length > 0
					? html`${this.renderSectionHeader("Scheduled")}${scheduled.map((item) => this.renderAutomationRow(item))}`
					: null}
				${completed.length > 0
					? html`${this.renderSectionHeader("Completed")}${completed.map((run) => this.renderRunRow(run))}`
					: null}
				${archived.length > 0
					? html`${this.renderSectionHeader("Archived")}${archived.map((run) => this.renderRunRow(run))}`
					: null}
			</div>
		`
	}

	private renderCreate() {
		return html`
			<div class="form">
				<label>
					${this.locale.t("litAutomations.name")}
					<input
						.value=${this.name}
						@input=${(e: Event) => {
							this.name = (e.target as HTMLInputElement).value
						}}
					/>
				</label>
				<label>
					${this.locale.t("litAutomations.prompt")}
					<textarea
						rows="4"
						.value=${this.prompt}
						@input=${(e: Event) => {
							this.prompt = (e.target as HTMLTextAreaElement).value
						}}
					></textarea>
				</label>
				<label>
					${this.locale.t("litAutomations.workspace")}
					<input
						.value=${this.workspace}
						placeholder="/path/to/project"
						@input=${(e: Event) => {
							this.workspace = (e.target as HTMLInputElement).value
						}}
					/>
				</label>
				<button
					type="button"
					class="primary"
					?disabled=${this.creating}
					@click=${() => this.create()}
				>
					${this.locale.t("litAutomations.create")}
				</button>
			</div>
		`
	}

	private renderEmptyDetail(): ReturnType<typeof html> {
		const hasAutomations = this.items.length > 0
		const unreadCount = this.runs.filter((run) => run.readAt === null && run.status === "pending_review").length
		return html`
			<div class="detail-empty">
				<div class="empty-mark" aria-hidden="true">
					${hasAutomations
						? html`<svg viewBox="0 0 16 16"><path d="M4.5 7.1a3.5 3.5 0 0 1 7 0v1.2a3.5 3.5 0 0 1-7 0zM3 7.2h1.5M11.5 7.2H13M5.2 12.2l1.2-1M10.8 12.2l-1.2-1" /></svg>`
						: html`<svg viewBox="0 0 16 16"><path d="m9.1 1.5-5.6 7h3.7l-.3 6 5.6-7H8.8z" /></svg>`}
				</div>
				<div>
					${hasAutomations
						? html`<p class="empty-message">${
							unreadCount > 0
								? `${unreadCount} unread automation${unreadCount === 1 ? "" : "s"}`
								: "No unread automations"
						}</p>`
						: html`<h2>${this.locale.t("litAutomations.title")}</h2><p>Set up recurring AI tasks that run on a schedule.</p>`}
					${
						!hasAutomations
							? html`
								<button type="button" class="primary" @click=${() => (this.showCreate = true)}>
									Create Automation
								</button>
							`
							: null
					}
				</div>
			</div>
		`
	}

	private renderRunDetail(): ReturnType<typeof html> {
		const run = this.runs.find((item) => item.id === this.selectedRunId)
		if (!run) return this.renderEmptyDetail()
		const automation = this.items.find((item) => item.id === run.automationId)
		const duration = run.startedAt && run.completedAt ? run.completedAt - run.startedAt : null
		return html`
			<div class="run-detail">
				<div class="detail-header">
					<div>
						<h2>${run.resultTitle || automation?.name || "Automation run"}</h2>
						<p>${run.status} · ${new Date(run.updatedAt).toLocaleString()}</p>
					</div>
					${run.sessionId
						? html`<button type="button" class="primary" @click=${() => navigate(`/session/${run.sessionId}`)}>
							Open session
						</button>`
						: null}
				</div>
				<div class="run-meta">
					<span>Workspace: ${run.workspace}</span>
					${duration ? html`<span>Duration: ${Math.round(duration / 1000)}s</span>` : null}
					${run.resultBranch ? html`<span>Branch: ${run.resultBranch}</span>` : null}
				</div>
				${run.resultSummary
					? html`<gcode-markdown source=${run.resultSummary}></gcode-markdown>`
					: html`<p class="run-placeholder">
						${run.status === "running"
							? "This run is in progress. Its live session will be available shortly."
							: run.errorMessage || "No output recorded for this run."}
					</p>`}
				${run.errorMessage ? html`<p class="error">${run.errorMessage}</p>` : null}
				${run.resultPrUrl
					? html`<a class="external" href=${run.resultPrUrl} target="_blank" rel="noreferrer">Open pull request ↗</a>`
					: null}
			</div>
		`
	}

	render() {
		return html`
			<div class="automation-page">
				${!this.bannerDismissed
					? html`
							<div class="banner-wrap">
								<div class="automation-banner" role="note">
									<p>
										<strong>Automations run unattended</strong> with broad permissions: all tools are
										allowed (file reads, edits, bash commands) and interactive prompts are auto-denied
										since no one is watching.
									</p>
									<button type="button" aria-label="Dismiss" @click=${() => this.dismissBanner()}>
										<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg>
									</button>
								</div>
							</div>
						`
					: null}
				<div class="automation-shell">
					<aside class="inbox-panel">
						<div class="toolbar">
							<h1>${this.locale.t("litAutomations.title")}</h1>
							<div class="toolbar-actions">
								<button type="button" class="icon-button" disabled aria-label="Filter automations">
									<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 3.5h11M4.5 8h7M6.5 12.5h3" /></svg>
								</button>
								<button type="button" class="new-automation" @click=${() => (this.showCreate = true)}>
									<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg><span>New</span>
								</button>
							</div>
						</div>
						<div class="inbox-content">
							${this.error ? html`<div class="error">${this.error}</div>` : null}
							${this.renderList()}
						</div>
					</aside>
					<section class="detail-panel">
						${this.showCreate ? this.renderCreate() : this.renderRunDetail()}
					</section>
				</div>
			</div>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"gcode-automations": GcodeAutomations
	}
}
