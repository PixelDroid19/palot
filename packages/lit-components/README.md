# @palot/lit-components

Portable, framework-agnostic `palot-*` Web Components built with Lit.

Each component:

- Has a unique `palot-` custom element tag
- Owns a local `.scss` (compiled to `.css.js` via `@palot/lit-styles`)
- Uses only shared tokens (no Tailwind inside)
- Receives data via `@property`
- Emits user intent via `CustomEvent` with `bubbles: true`, `composed: true`
- Has dedicated unit tests (render + event emission)
- Is individually exportable / importable
- Registers on module import (side-effect barrel)

## Current Components

- `palot-session-row`
- `palot-project-row`
- `palot-status-badge`
- `palot-permission-item`
- `palot-question-item`
- `palot-automation-row`
- `palot-provider-icon`
- `palot-model-option`
- `palot-attachment-preview`

(See `src/*.ts` + their `.scss`.)

## Usage (in React host during migration)

```tsx
import "@palot/lit-components" // side-effect: registers all custom elements

// then
{createElement("palot-session-row", { "session-id": id, title, status })}
```

Or in plain HTML/Lit/any framework that supports custom elements.

## Rules (non-negotiable)

- Never import React/Jotai/Electron/Node/`window.palot`/provider SDKs.
- Never call providers directly — emit DOM events only.
- Host translates DOM events → `PalotCommand` → bus.

See `roadmap/lit-migration.md`, `roadmap/agent.md`.

## Styling

Use CSS custom properties from `@palot/tokens`. Global shell effects stay in the app shell.

## Testing

33+ tests across `test/`. Uses happy-dom.

`bun test` inside package (also covered by root `bun run test`).

## Related

- `@palot/lit-styles` (the generator)
- `@palot/tokens`
- `@palot/core` (supplies view models in future)
- Hosted today inside `apps/desktop` (new-chat demo + future surfaces)
- `docs/IMPORT-ARCHITECTURE.md`
