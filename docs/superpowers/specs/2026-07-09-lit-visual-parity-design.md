# Lit visual parity design

## Objective

Replace the desktop React renderer with Lit without changing the product's visual language or user-visible workflows.

## Reference and acceptance rule

The current React renderer is the canonical reference until each corresponding Lit route passes comparison. A Lit route is eligible to replace its React counterpart only when it preserves:

- layout geometry, responsive breakpoints, typography, color, borders, spacing, and focus states;
- empty, loading, offline, populated, and error states;
- the route's primary interaction path; and
- renderer console health with no product errors.

Visual comparison uses matching desktop viewports and captured screenshots. The Electron renderer remains the final target; browser-mode screenshots are a fast preflight only.

## Architecture

`renderer/lit/` becomes the product shell. It owns hash routing, DOM events, locale, theme, and Lit-native stores. Framework-neutral code remains in `renderer/services/`, `renderer/i18n/`, `renderer/lib/`, and preload IPC. React/Jotai/TanStack code is retained only as a temporary visual and behavior reference, then removed together with React-specific dependencies.

The migration is organized in independently releasable surfaces:

1. App frame: startup handoff, titlebar, sidebar, home, project/session navigation, shared tokens.
2. Session surface: composer, transcript, tool activity, approval and question gates, terminal panel.
3. Settings and integrations: every settings subsection, provider management, theme and locale.
4. Onboarding and automations: first-run, migration preview, schedules, run history and details.
5. Cleanup: remove React entrypoint, React components/atoms/hooks/router, React-only dependencies and Tailwind from the desktop product.

## Styling strategy

The Lit token layer adopts the React surface values and component geometry rather than inventing a second visual system. Every Lit component uses co-located SCSS compiled into `*.css.js`; generated files are never edited. Shared primitives cover button, input, select, card, menu, dialog, tooltip, status, and split-pane behavior before route templates consume them.

## State and data flow

Lit stores are small, framework-free modules. They subscribe to IPC and service calls, expose snapshots plus subscribe/unsubscribe functions, and publish updates through `gcodeBus` only for cross-tree UI topics. Runtime/session access continues through `window.gcode.agentSession` and neutral service modules. No product path may depend on a runtime-specific HTTP server.

## Verification matrix

For every migrated surface:

1. Add a unit test for the Lit route/component contract.
2. Capture a React reference screenshot at the same viewport and state.
3. Capture the Lit candidate screenshot at the same viewport and state.
4. Exercise one primary interaction and confirm its result in the DOM.
5. Check browser console errors and warnings relevant to the product.
6. Run desktop tests, typecheck, and build before the commit that switches the route.

## Explicit non-goals

- No visual redesign during migration.
- No partial Lit shell activation before the full app-frame parity gate passes.
- No React bridge or React component mounting inside Lit as a permanent compatibility layer.
