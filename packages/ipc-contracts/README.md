# @palot/ipc-contracts

Single source of truth for all Palot IPC channel constants, payload types, response types, and Zod/validation schemas.

Keeps `main`, `preload`, and `renderer` perfectly in sync. Validation happens at the main-process boundary.

## Usage

```ts
import { IPC_CHANNELS, type IpcRequest, type IpcResponse } from "@palot/ipc-contracts"
// or from sub modules if exposed
```

Used by:

- `apps/desktop/src/main/ipc-handlers.ts`
- `apps/desktop/src/preload/...`
- `apps/desktop/src/renderer/services/...`

## Why

Manual duplication of IPC contracts was a major pressure point (architecture-review.md). This package + tests prevent drift.

## Testing

`packages/ipc-contracts/test/ipc-contracts.test.ts`

## Related

See `roadmap/`, `docs/IMPORT-ARCHITECTURE.md` (platform + IPC section), `AGENTS.md` (Electron IPC skill).

Part of foundational platform slice.
