# Palot Platform Roadmap

**Status (as of this session - updated post-audit + hard work on observations in current-review.md):** 

Foundational platform packages are solid (events, core, opencode adapter full + harness sims, 9+ lit components with tests, styles pipeline). Package tests/lint pass. Desktop integration started (dual-write platformCoreState + adapter in connection-manager/backend, atoms, demo exercise) but per current-review.md observations there are still blockers and legacy mixing.

Current verified (after fixes started):
- `bun run lint` and `bun run test` (platform filters) pass.
- Platform packages have extensive coverage (replays, harness flows for prompt/perm/q/diff/error/automation, lit render+event tests, mapper contracts).
- 9 Lit components (session-row, project-row, status-badge, provider-icon, model-option, permission-item, question-item, attachment-preview, automation-row) with .scss -> css.js, decorators, events bubbles+composed, no forbidden imports.
- Desktop check-types and build still have issues (decorator tsconfig mismatch when paths pull lit src; vite plugin generator path/cwd not robust for `cd apps/desktop && bun run build`; some incomplete dispatchPlatformCommand / scope / unused in backend from integration work).
- Demo Lit + platform exercise code still visible in NewChat (prod surface) - major observation to address.
- Stale adapter, batching, fake getPalotAgentAdapter, placeholder ipc-contracts, lockfile warnings for new workspaces (agent-adapter-codex etc) still present per review observations.
- No "weird fallbacks" in core/adapter (model always required or explicit throw; explicit guards).

Continue hard work from `current-review.md` (user observations) + this session's fixes. The goal is zero legacy direct SDK mixing in new platform paths, full use of adapter/core for new code, demo isolated, typecheck/build green, at least one real migration started. Always re-verify against roadmap principles (compatibility, core first, events contract, portable lit, tests prove, no big-bang).

Previous status notes preserved below for history; see "Current Status" and "Recommended Next" sections for action.

This directory is a technical roadmap for turning Palot into a durable desktop
platform for AI coding agents. The target is a product in the same class as
Codex Desktop, OpenCode Desktop, Claude Code Desktop, and future Palot-native
agent runtimes.

The roadmap has no time estimates. The order is based on dependencies, risk,
and keeping the current OpenCode-compatible app working during the migration.

## Documents

- `architecture-review.md`: current architecture review and the main technical
  pressure points.
- `lit-migration.md`: migration path from React UI surfaces toward Lit Web
  Components, including per-component SCSS and generated `css.js` files.
- `core-agent-platform.md`: core architecture, typed events, pub/sub channels,
  command bus, and provider adapter strategy.
- `functional-testing.md`: functional testing strategy for real behavior, event
  replay, IPC, provider adapters, and Lit components.
- `current-review.md`: review of the latest implementation changes, including
  what is working, what is broken, and what remains missing.
- `recommendations.md`: my direct technical recommendations and sequencing
  choices.
- `agent.md`: detailed instructions for agents that implement this roadmap.

## Product Direction

Palot should become a host for multiple coding-agent backends, not an app whose
behavior is hardwired to one provider or one UI framework. OpenCode remains the
stable provider today. Codex, Claude Code, and a Palot-native harness should fit
behind the same command and event contracts later.

The app should evolve toward these properties:

- A portable core that owns business rules and state transitions.
- Provider adapters that translate external protocols into Palot events.
- UI components that receive view models and emit typed events.
- Electron as the native shell, not the place where product logic accumulates.
- Lit components that can be reused inside Palot or moved to another app.
- Functional tests that exercise actual session, prompt, permission, question,
  automation, IPC, and event-stream behavior.

## Recommended Migration Shape

1. Fix the current typecheck and desktop build blockers listed in
   `current-review.md`.
2. Keep the existing Electron + React + OpenCode app working.
3. Stabilize the canonical Palot command and event contracts.
4. Stabilize the typed event bus and command bus.
5. Keep extracting core reducers, use cases, and view models out of React/Jotai.
6. Harden the OpenCode provider adapter as the first real adapter.
7. Expand the deterministic local agent harness for functional tests.
8. Fix and harden the Lit SCSS-to-`css.js` pipeline.
9. Migrate leaf UI components first.
10. Migrate composed surfaces once view models are framework-neutral.
11. Retire React/Jotai only after the shell no longer depends on them.

## Current Status

The foundational package work has started. The repo now contains early packages
for events, core, provider adapters, a deterministic harness, IPC contracts,
tokens, Lit styles, and Lit components.

The work is not ready to be treated as complete yet:

- `bun run test` passes.
- `bun run lint` passes.
- `bun run check-types` fails in `@palot/desktop`.
- `cd apps/desktop && bun run build` fails in the Lit styles Vite plugin.
- Turbo reports lockfile warnings for new workspace packages.

Continue from `current-review.md` before doing larger migration work.

## Non-Negotiable Principles

- Compatibility first: OpenCode must keep working throughout the migration.
- Core first, UI second: do not rewrite React screens into Lit while business
  logic is still embedded in components.
- Events are the contract: providers publish canonical Palot events, and UI
  actions become canonical Palot commands.
- Components stay portable: Lit components must not import React, Jotai,
  Electron, Node builtins, `window.palot`, or provider SDKs.
- IPC stays narrow: native access should be implemented through explicit ports
  and validated IPC contracts.
- Tests prove behavior: every major extraction needs unit, contract, replay, or
  functional coverage before the next larger cut.
