# Core And Agent Platform

## Goal

Separate business logic from UI and turn Palot into an extensible desktop
platform for coding agents. OpenCode remains the current stable provider, while
Codex, Claude Code, and a Palot-native harness should become provider adapters
behind the same command and event contracts.

## Proposed Packages

```text
packages/
  core/
    src/
      commands/
      events/
      sessions/
      workspaces/
      automations/
      settings/
      view-models/
      index.ts
  events/
    src/
      event-bus.ts
      channels.ts
      event-types.ts
      replay.ts
      index.ts
  ipc-contracts/
    src/
      channels.ts
      schemas.ts
      main.ts
      preload.ts
      renderer.ts
      index.ts
  agent-adapter-opencode/
    src/
      adapter.ts
      event-mapper.ts
      client.ts
      index.ts
  agent-adapter-codex/
    src/
      adapter.ts
      index.ts
  agent-adapter-claude-code/
    src/
      adapter.ts
      index.ts
  agent-harness/
    src/
      fake-agent-server.ts
      deterministic-events.ts
      index.ts
```

## Pure Core Rules

`packages/core` should be plain TypeScript.

Allowed:

- canonical types
- use cases
- reducers
- view models
- command types
- event types
- abstract ports

Forbidden:

- React
- Jotai
- Lit
- Electron
- DOM
- Node builtins
- `window.palot`
- direct imports from provider SDKs

The core should own product rules such as:

- how session state changes when events arrive
- how messages and parts are merged
- how streaming deltas are applied
- how permissions and questions are represented
- how model selection resolves to an effective model
- how automation runs move through statuses
- how view models expose state to UI

## Canonical Palot Events

Provider-specific events should be translated before reaching the UI. OpenCode,
Codex, Claude Code, and the Palot harness should all produce Palot events.

Example:

```ts
export type PalotEvent =
  | { type: "provider.connected"; providerId: string; at: number }
  | { type: "provider.disconnected"; providerId: string; reason?: string; at: number }
  | { type: "workspace.discovered"; workspace: WorkspaceInfo; at: number }
  | { type: "session.created"; session: SessionInfo; at: number }
  | { type: "session.updated"; session: SessionInfo; at: number }
  | { type: "session.deleted"; sessionId: string; at: number }
  | { type: "session.status.changed"; sessionId: string; status: SessionStatus; at: number }
  | { type: "message.upserted"; sessionId: string; message: MessageInfo; at: number }
  | { type: "message.removed"; sessionId: string; messageId: string; at: number }
  | { type: "message.part.upserted"; sessionId: string; messageId: string; part: MessagePartInfo; at: number }
  | { type: "message.part.delta"; sessionId: string; messageId: string; partId: string; field: string; delta: string; at: number }
  | { type: "message.part.removed"; sessionId: string; messageId: string; partId: string; at: number }
  | { type: "permission.requested"; sessionId: string; request: PermissionRequest; at: number }
  | { type: "permission.resolved"; sessionId: string; requestId: string; at: number }
  | { type: "question.requested"; sessionId: string; request: QuestionRequest; at: number }
  | { type: "question.resolved"; sessionId: string; requestId: string; at: number }
  | { type: "automation.run.updated"; run: AutomationRunInfo; at: number }
```

Requirements:

- Events must be serializable.
- Events must include stable identifiers.
- Provider event mapping must be tested with fixtures.
- High-volume events must support batching and coalescing.
- Events must be replayable in tests.
- UI must not depend on provider-specific event shapes.

## Pub/Sub And Command Bus

Use two separate contracts:

- `EventBus`: publish and subscribe to facts that happened.
- `CommandBus`: dispatch user or system intentions.

Example commands:

```ts
export type PalotCommand =
  | { type: "session.create"; workspaceId: string; title?: string }
  | { type: "session.prompt"; sessionId: string; parts: PromptPart[]; model?: ModelRef; agent?: string; variant?: string }
  | { type: "session.abort"; sessionId: string }
  | { type: "session.delete"; sessionId: string }
  | { type: "session.rename"; sessionId: string; title: string }
  | { type: "permission.respond"; sessionId: string; requestId: string; response: PermissionResponse }
  | { type: "question.reply"; requestId: string; answers: QuestionAnswer[] }
  | { type: "question.reject"; requestId: string }
  | { type: "automation.run-now"; automationId: string }
```

Rules:

- UI emits commands.
- Provider adapters execute commands.
- Results come back as events.
- React, Lit, automations, and future CLI surfaces use the same command model.

## Recommended Channels

Use explicit channel names for event routing:

- `app.lifecycle`
- `provider.connection`
- `workspace.discovery`
- `session.lifecycle`
- `session.messages`
- `session.permissions`
- `session.questions`
- `session.diff`
- `automation.runs`
- `settings.changed`
- `ui.navigation`

The channel system should support:

- `subscribe(channel, handler)`
- `publish(channel, event)`
- unsubscribe cleanup
- event recording for tests
- event replay for deterministic debugging
- batch delivery for high-volume message events

## Provider Adapter Interface

```ts
export interface AgentProviderAdapter {
  id: string
  label: string

  connect(input: ProviderConnectionInput): Promise<ProviderConnection>
  disconnect(): Promise<void>

  listWorkspaces(): Promise<WorkspaceInfo[]>
  listSessions(input: ListSessionsInput): Promise<SessionInfo[]>
  getSession(input: GetSessionInput): Promise<SessionInfo | null>

  dispatch(command: PalotCommand): Promise<void>
  events(signal: AbortSignal): AsyncIterable<PalotEvent>
}
```

## OpenCode Adapter Requirements

- Use `@opencode-ai/sdk/v2/client`.
- Use `/global/event`, exposed by the SDK as `client.global.event()`.
- Translate OpenCode events into Palot events.
- Preserve the current Electron fetch proxy for non-SSE requests where needed.
- Keep SSE requests in the renderer when they need streaming bodies.
- Pass the resolved model to `promptAsync`.
- Keep current reconnection and backoff behavior.
- Preserve batching and coalescing semantics.

## Codex Adapter Requirements

- Implement the same `AgentProviderAdapter` interface.
- Map Codex sessions, messages, tool calls, approvals, and status changes into
  canonical Palot types.
- Avoid leaking Codex-specific types into the UI.
- Make authentication and account state explicit through provider connection
  events.

## Claude Code Adapter Requirements

- Implement the same `AgentProviderAdapter` interface.
- Use `packages/configconv` where it helps with configuration migration.
- Normalize history, agents, commands, permissions, and project state into
  canonical Palot types.
- Keep provider-specific capability differences behind adapter metadata.

## Palot Harness Requirements

The harness should be a deterministic local provider for testing and future
Palot-native behavior.

It should simulate:

- projects
- sessions
- prompt async behavior
- streaming message parts
- tool calls
- permission requests
- question requests
- diffs
- session errors
- reconnects
- concurrent sessions
- automation runs

This harness is critical. Without it, a multi-provider UI migration will depend
too much on live external tools.

## View Models

Lit components should not assemble business logic. They should receive view
models.

Recommended view models:

- `SidebarViewModel`
- `ProjectTreeViewModel`
- `ChatViewModel`
- `ChatTurnViewModel`
- `PromptInputViewModel`
- `PermissionPanelViewModel`
- `QuestionPanelViewModel`
- `AutomationInboxViewModel`
- `SettingsViewModel`

Each view model should:

- be derived from core state
- be serializable or easy to compare
- use stable ids for tests
- contain no React functions
- contain no DOM references
- expose actions as command descriptors, not callbacks

## Native Shell Boundary

Electron should implement native ports:

- filesystem
- credentials
- git
- external links
- native dialogs
- updater
- tray
- notifications
- OpenCode process lifecycle

`window.palot` can remain the preload bridge, but the app should treat it as one
implementation of `NativeShellPort`, not as a product-level dependency.

