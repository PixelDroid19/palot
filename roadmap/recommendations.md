# Recommendations

This is my opinionated technical guidance for the roadmap. It is intentionally
direct because the biggest risk is spending effort on a framework migration
without first creating the platform boundaries Palot needs.

## 1. Do Not Start With A Full Lit Rewrite

The current React UI is not the core problem. The core problem is that product
logic, provider behavior, event processing, and UI state are still too close
together.

Recommended decision:

- Keep React while extracting core logic.
- Introduce Lit as leaf components first.
- Move full screens to Lit only after view models are framework-neutral.

Why:

- A direct rewrite would recreate the same coupling in Lit.
- React can host Web Components during the transition.
- The app stays usable while the architecture improves.

## 2. Build The Palot Event Model Before Adding More Providers

OpenCode, Codex, Claude Code, and a Palot harness will not have identical
protocols. If each provider shapes the UI directly, every screen will grow
conditionals.

Recommended decision:

- Define canonical Palot events and commands first.
- Add provider adapters behind those contracts.
- Make the UI depend on Palot events and view models, not provider SDKs.

## 3. Treat OpenCode As The First Adapter, Not The Platform

OpenCode compatibility is important and should remain stable. It should not
define the whole platform vocabulary.

Recommended decision:

- Keep the current OpenCode behavior working.
- Wrap it with `agent-adapter-opencode`.
- Map OpenCode-specific details into Palot concepts.
- Keep OpenCode-specific capability gaps in adapter metadata.

## 4. Create The Harness Early

A deterministic local harness will pay for itself quickly. It lets you test
chat, streaming, permissions, questions, diffs, automation runs, reconnects, and
provider switching without depending on live external tools.

Recommended decision:

- Build `packages/agent-harness` before migrating full screens.
- Use it for E2E behavior tests and event replay fixtures.
- Make it boring and deterministic.

## 5. Split `connection-manager.ts` By Responsibility

The current connection manager is doing several real jobs:

- connection lifecycle
- health checks
- OpenCode client creation
- SSE reconnect loop
- batching and coalescing
- direct Jotai writes through event processing

Recommended decision:

- Move OpenCode transport to the OpenCode adapter.
- Move batching/coalescing to `packages/events`.
- Move state transitions to `packages/core`.
- Leave only temporary wiring in the renderer during migration.

## 6. Replace Broad Renderer Services With Ports

`services/backend.ts` is a practical bridge, but it should not become the
long-term platform API.

Recommended decision:

- Define ports per domain.
- Implement Electron and browser-mode versions behind those ports.
- Keep `backend.ts` as a compatibility layer until callers migrate.

## 7. Generate IPC Wrappers From A Contract

Manual IPC coordination is error-prone. It will get worse as the platform grows.

Recommended decision:

- Add `packages/ipc-contracts`.
- Define channel, request, and response types once.
- Derive main/preload/renderer wrappers.
- Add validation at the main-process boundary.

## 8. Keep Lit Components Dumb, But Not Weak

Lit components should be presentation units with strong contracts. They should
not fetch data or execute provider commands.

Recommended decision:

- Components receive view-model data as properties.
- Components emit typed DOM events.
- Host adapters translate DOM events into Palot commands.
- Components own accessibility, layout, focus behavior, and local interaction
  state.

## 9. Avoid Tailwind Inside Portable Lit Components

Tailwind is useful in the current React app. It is less useful for portable Web
Components because class generation and global CSS become package concerns.

Recommended decision:

- Use SCSS and shared CSS variables in Lit components.
- Keep Tailwind in the React/shadcn compatibility layer.
- Share design tokens, not utility classes.

## 10. Use Event Replay As A Core Debugging Tool

Streaming agent apps fail in event ordering, reconnects, partial updates, and
high-volume message flows. Unit tests alone will miss those failures.

Recommended decision:

- Store representative event streams as JSONL fixtures.
- Replay them into core reducers.
- Assert final state and view-model snapshots.
- Add fixtures for every provider adapter.

## 11. Keep Automations In The Platform Roadmap

Automations are not a side feature. They are proof that Palot can run agent work
without direct user interaction.

Recommended decision:

- Model automation commands and events in the same core.
- Test automation runs with the harness.
- Keep permission behavior explicit and safe.
- Avoid embedding automation-specific assumptions in UI components.

## 12. Make Package Boundaries Enforceable

Documentation helps, but architecture needs enforcement.

Recommended decision:

- Add import-boundary rules for new packages.
- Add tests or lint checks that reject forbidden imports.
- Make `packages/core` fail if it imports UI, Electron, DOM, or provider SDKs.
- Make `packages/lit-components` fail if it imports React, Jotai, Electron, or
  provider SDKs.

## My Preferred First Implementation Slice

The first implementation slice originally should be small but foundational:

1. Create `packages/events` with a typed event bus, channel names, and replay
   helper.
2. Create `packages/core` with canonical event and command types plus one
   reducer for session lifecycle.
3. Add event replay tests for a basic session stream.
4. Add `packages/agent-harness` with a minimal deterministic event stream.
5. Wire nothing into the production UI yet.

Why this slice:

- It creates the platform spine.
- It does not disturb current OpenCode behavior.
- It gives future Lit work a real state contract.
- It gives adapter work a testable event target.

That slice is now partially implemented. Do not expand it yet. Stabilize it
first.

## Updated Immediate Recommendation

The next implementation pass should not add new features. It should make the
new foundation build-clean and host-safe:

1. Fix `@palot/desktop` typecheck.
2. Fix the Lit styles Vite plugin so it works when Vite is launched from
   `apps/desktop`.
3. Refresh the workspace lockfile so Turbo stops warning about missing
   workspaces.
4. Move demo-only Lit/harness/adapter wiring out of `NewChat`.
5. Fix dispatch adapter lifecycle so server switches cannot reuse an adapter
   connected to the old server.
6. Add regression tests for those fixes.

This is the highest-value work now because the repo already has a foundation,
but the foundation is not yet reliable inside the desktop host.

## My Preferred First Lit Slice

After the first core slice, start Lit with a small component:

1. Add `packages/lit-styles`.
2. Add `packages/lit-components`.
3. Implement SCSS-to-`css.js` generation.
4. Create `palot-session-row`.
5. Render it from the current React sidebar behind a small adapter.
6. Test its properties, events, and generated styles.

Why this slice:

- It proves the build pipeline.
- It proves React can host Lit.
- It does not force a screen rewrite.
- It creates a pattern other components can follow.

## What I Would Avoid

- A one-shot migration from React to Lit.
- Adding Codex support before canonical Palot events exist.
- Letting `window.palot` become the platform API.
- Letting `services/backend.ts` grow into a permanent service locator.
- Adding Tailwind-heavy Lit components.
- Testing only with live OpenCode.
- Keeping provider-specific event shapes in UI state.
- Moving code into packages without adding import-boundary enforcement.
- Leaving demo/proof wiring visible in product screens.
- Claiming IPC contract migration is complete while `@palot/ipc-contracts` only
  contains an example channel.
- Subscribing UI to platform core state before the platform event feed has
  batching/coalescing parity with the legacy Jotai path.
