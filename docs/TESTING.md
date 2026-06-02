# Testing — Palot

This document describes how we verify Palot: unit tests for business logic, and Playwright E2E for user flows. **Do not assert on copy/text in E2E** — wording changes should not break CI.

## Quick commands

| Command | What it runs |
|---------|----------------|
| `bun run test` | All unit tests (Turborepo: `configconv` + `desktop`) |
| `cd apps/desktop && bun test` | Desktop unit tests only |
| `cd packages/configconv && bun test` | Config converter tests |
| `bun run test:e2e` | Playwright (starts `apps/server` + `dev:web`) |

First-time E2E setup:

```bash
bunx playwright install chromium
bun run test:e2e
```

## Unit tests (`bun:test`)

### Where they live

- **`packages/configconv/test/`** — migration, converters, scanner, writer, validator
- **`apps/desktop/test/`** — shared business logic used by the renderer/main process

### What belongs in unit tests

- Pure functions and algorithms (message merge/cap, SSE coalescing keys, mock URL parsing)
- Semaphore / concurrency limits
- Scale constants
- Config conversion round-trips

### What does **not** belong in unit tests (use E2E instead)

- Button labels, headings, toast messages
- Visual layout or CSS
- Full Electron IPC (extract logic first, then unit-test the pure part)

### Desktop modules under test

| Module | Path |
|--------|------|
| Message list helpers | `apps/desktop/src/shared/message-utils.ts` |
| SSE coalescing | `apps/desktop/src/shared/sse-coalescing.ts` |
| Mock mode URL | `apps/desktop/src/shared/mock-mode-url.ts` |
| Scale limits | `apps/desktop/src/shared/scale-limits.ts` |
| Automation semaphore | `apps/desktop/src/main/automation/semaphore.ts` |
| Tool category helpers | `apps/desktop/src/renderer/lib/tool-category.ts` |

When adding business logic, prefer `apps/desktop/src/shared/*.ts` so it can be tested without Jotai or Electron. Renderer-only pure helpers can live in `renderer/lib/` with tests in `apps/desktop/test/`.

## E2E tests (Playwright)

### Layout

```
e2e/
  api.spec.ts       # Palot server HTTP API
  app-mock.spec.ts  # UI flows with ?mock=1 (stable, no OpenCode required)
  app-live.spec.ts  # Real discovery (needs OpenCode CLI)
  fixtures.ts       # Routes and session IDs (not UI copy)
  selectors.ts      # data-testid helpers
```

### Selector policy

1. **`data-testid`** — defined in [`apps/desktop/src/shared/test-ids.ts`](../apps/desktop/src/shared/test-ids.ts), mirrored in [`e2e/selectors.ts`](../e2e/selectors.ts).
2. **Dynamic rows** — `data-session-id`, `data-project-slug` on sidebar items.
3. **URLs** — hash routes (`#/project/.../session/...`) for navigation.
4. **Roles** — `textbox`, `dialog` only when no test id exists.
5. **Never** — `getByText('Add dark mode...')`, regex on chat content, heading copy.

### Demo mode (`?mock=1`)

Mock mode loads fixture data from `mock-data.ts` without OpenCode. Use for all UI interaction tests:

```
http://localhost:1420/#/?mock=1
http://localhost:1420/#/project/<slug>/session/<id>?mock=1
```

### Live mode

`app-live.spec.ts` hits `/` without mock and waits for `new-chat-prompt`. Requires OpenCode installed (same as dev). API test skips if OpenCode cannot start.

## CI

- **Unit**: job `Test` — `bun run test`
- **E2E**: job `E2E` — Playwright with `CI=true`, 1 worker, 2 retries

## Adding a new UI flow

1. Add `TEST_IDS.*` in `test-ids.ts` and `e2e/selectors.ts`.
2. Set `data-testid` on the component (and `data-session-id` if it's a list row).
3. Write E2E: navigate → interact (click, keyboard) → assert test id or URL.
4. Do **not** add assertions on user-visible strings.

## PR checklist

- [ ] `bun run lint`
- [ ] `bun run test`
- [ ] If UI/routes/IPC changed: `bun run test:e2e`
- [ ] If `apps/server` routes changed: `cd apps/server && bun run build:types`
- [ ] User-facing change: `bun changeset`