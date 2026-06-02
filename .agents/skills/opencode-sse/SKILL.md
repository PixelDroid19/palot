---
name: opencode-sse
description: OpenCode SSE and connection patterns in Palot. Use when changing event streaming, session sync, or SDK client usage.
---

# OpenCode SSE (Palot)

## Entry points

- `connection-manager.ts` — single server connection, per-project clients, SSE loop, 16ms batching.
- `event-processor.ts` — dispatches events to Jotai atoms via `appStore`.
- Always use SDK v2: `@opencode-ai/sdk/v2/client`.

## Global events

Subscribe via `/global/event` (not `/event`) so all projects receive events.

## Session state cleanup

- `session.deleted` → `removeSessionAtom` → `evictSessionState()` in `session-eviction.ts`.
- `disconnect()` → `evictAllSessionsAtom` clears all session atom families.

## Scale limits

See `apps/desktop/src/shared/scale-limits.ts`:
- `MAX_MESSAGES_PER_SESSION` (200)
- `SESSIONS_PAGE_SIZE` (5)
- `FRAME_BUDGET_MS` (16)

## Footguns

- Pass resolved model to `promptAsync` — server has no default model.
- On server switch, call `disconnect()` and reset project pagination.
- Prefer `services/backend.ts` over direct SDK in hooks.