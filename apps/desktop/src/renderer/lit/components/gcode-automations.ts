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
	runAutomationNow,
} from "../../services/backend"
import { LocaleController } from "../locale-controller"
import { styles } from "./gcode-automations.css.js"

@customElement("gcode-automations")
export class GcodeAutomations extends LitElement {
	static styles = styles
	private locale = new LocaleController(this)

	@state() private items: Automation[] = []
	@state() private runs: AutomationRun[] = []
	@state() private error = ""
	@state() private loading = true
	@state() private tab: "list" | "create" | "inbox" = "list"
	@state() private name = ""
	@state() private prompt = ""
	@state() private workspace = ""
	@state() private creating = false

	connectedCallback(): void {
		super.connectedCallback()
		void this.reload()
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

	private async run(id: string): Promise<void> {
		try {
			await runAutomationNow(id)
			await this.reload()
		} catch (err) {
			this.error = err instanceof Error ? err.message : String(err)
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
			this.tab = "list"
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

	private renderList() {
		if (this.loading) return html`<div class="empty">…</div>`
		if (this.items.length === 0) {
			return html`<div class="empty">${this.locale.t("litAutomations.empty")}</div>`
		}
		return html`
			<div class="list">
				${this.items.map(
					(a) => html`
						<div class="row">
							<div>
								<div class="name">${a.name || a.id}</div>
								<div class="meta">
									${a.id} · ${a.status}
									${a.nextRunAt ? ` · next ${new Date(a.nextRunAt).toLocaleString()}` : ""}
								</div>
							</div>
							<button type="button" class="primary" @click=${() => this.run(a.id)}>
								${this.locale.t("litAutomations.runNow")}
							</button>
						</div>
					`,
				)}
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

	private renderInbox() {
		if (this.loading) return html`<div class="empty">…</div>`
		if (this.runs.length === 0) {
			return html`<div class="empty">${this.locale.t("litAutomations.inboxEmpty")}</div>`
		}
		return html`
			<div class="list">
				${this.runs.map(
					(r) => html`
						<div class="row">
							<div>
								<div class="name">${r.resultTitle || r.id}</div>
								<div class="meta">
									${r.status} · ${r.automationId}
									${r.errorMessage ? ` · ${r.errorMessage}` : ""}
								</div>
								${
									r.resultSummary
										? html`<div class="meta" style="margin-top:4px">${r.resultSummary}</div>`
										: null
								}
							</div>
							${
								!r.readAt
									? html`
											<button type="button" @click=${() => this.markRead(r.id)}>
												${this.locale.t("litAutomations.markRead")}
											</button>
										`
									: null
							}
						</div>
					`,
				)}
			</div>
		`
	}

	private renderEmptyDetail(): ReturnType<typeof html> {
		const hasAutomations = this.items.length > 0
		return html`
			<div class="detail-empty">
				<div class="empty-mark" aria-hidden="true">⚡</div>
				<div>
					<h2>${hasAutomations ? "No unread automations" : this.locale.t("litAutomations.title")}</h2>
					<p>
						${
							hasAutomations
								? "Select a run from the inbox to inspect its result."
								: "Set up recurring AI tasks that run on a schedule."
						}
					</p>
					${
						!hasAutomations
							? html`
								<button type="button" class="primary" @click=${() => (this.tab = "create")}>
									Create automation
								</button>
							`
							: null
					}
				</div>
			</div>
		`
	}

	render() {
		return html`
			<div class="automation-shell">
				<aside class="inbox-panel">
					<div class="toolbar">
						<div>
							<h1>${this.locale.t("litAutomations.title")}</h1>
							<p>Scheduled work and unattended results</p>
						</div>
						<button
							type="button"
							class="new-automation"
							title=${this.locale.t("litAutomations.tabCreate")}
							@click=${() => {
								this.tab = "create"
							}}
						>
							+
						</button>
					</div>
					<div class="tabs">
						<button
							type="button"
							data-active=${String(this.tab === "list")}
							@click=${() => {
								this.tab = "list"
							}}
						>
							${this.locale.t("litAutomations.tabList")}
						</button>
						<button
							type="button"
							data-active=${String(this.tab === "inbox")}
							@click=${() => {
								this.tab = "inbox"
								void this.reload()
							}}
						>
							${this.locale.t("litAutomations.tabInbox")}
						</button>
						<button type="button" title=${this.locale.t("litAutomations.refresh")} @click=${() => this.reload()}>
							↻
						</button>
					</div>
					<div class="inbox-content">
						${this.error ? html`<div class="error">${this.error}</div>` : null}
						${this.tab === "inbox" ? this.renderInbox() : this.renderList()}
					</div>
				</aside>
				<section class="detail-panel">
					${this.tab === "create" ? this.renderCreate() : this.renderEmptyDetail()}
				</section>
			</div>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"gcode-automations": GcodeAutomations
	}
}
