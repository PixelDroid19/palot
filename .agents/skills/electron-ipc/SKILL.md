---
name: electron-ipc
description: Electron IPC patterns for Palot main/preload/renderer. Use when adding IPC channels, preload APIs, or debugging bridge issues.
---

# Electron IPC (Palot)

## Layers

- **Main**: handlers in `apps/desktop/src/main/ipc-handlers.ts` wrapped with `withLogging()`.
- **Preload**: expose via `contextBridge` in `apps/desktop/src/preload/index.ts`; types in `api.d.ts`.
- **Renderer**: always call `services/backend.ts`, never `window.palot` directly from hooks.

## Adding a channel

1. Implement handler in main (or re-export from domain module).
2. Add `ipcMain.handle("domain:action", ...)`.
3. Expose on `window.palot` in preload.
4. Extend `PalotAPI` in `api.d.ts`.
5. Add wrapper in `backend.ts` with Electron vs browser guard.

## Footguns

- Never import Node builtins in renderer.
- External URLs: main process `shell.openExternal`, never navigate renderer.
- Fetch to OpenCode from renderer uses IPC proxy to bypass Chromium 6-connection limit.
- Preload may not be ready at module load — use `window.palot?.method()`.

## Security

- Keep `contextBridge` surface minimal; validate all IPC inputs in main.
- Credentials only via `credential-store.ts` + `safeStorage`.