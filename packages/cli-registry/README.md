# @gcode/cli-registry

Detection and description of coding-agent CLIs for GCode.

GCode is not tied to a single agent runtime. This package models the
coding-agent CLIs it can work with as small, declarative **adapters** and probes
the host to report which are installed, their versions, and their auth state.

## Supported CLIs

| CLI          | id         | Managed backend |
| ------------ | ---------- | --------------- |
| OpenCode     | `opencode` | ✅ yes          |
| Claude Code  | `claude`   | detection only  |
| Codex        | `codex`    | detection only  |
| Cursor Agent | `cursor`   | detection only  |
| Gemini CLI   | `gemini`   | detection only  |

`managed` marks a CLI that GCode drives as a first-class runtime today.
Detection (version, auth state, install hints) is offered for every adapter, so
new runtimes can graduate to managed support without changing the model.

## Usage

```ts
import { detectAll, createNodeHost } from "@gcode/cli-registry"

const clis = await detectAll(createNodeHost())
// -> [{ id: "opencode", installed: true, version: "0.11.2", auth: "authenticated", ... }, ...]
```

## Architecture

- **`types.ts`** — `CliAdapter` (declarative CLI description) and
  `CliDetection` (probe result). Detection depends only on a `DetectionHost`
  interface (`which`, `run`, `pathExists`), never on Node directly.
- **`adapters/`** — one file per CLI. Adapters are pure data and hold no state.
- **`detect.ts`** — pure detection pipeline built on a `DetectionHost`.
- **`host.ts`** — `createNodeHost()`, the production `DetectionHost` backed by
  `child_process` and the filesystem. PATH resolution is done manually (no shell
  invocation), so probing a CLI we don't control has no side effects beyond a
  bounded `--version` call.

Because the logic is host-injected, it is exercised with fakes in unit tests and
against the real system in integration tests (`test/*.integration.test.ts`).

## Testing

```sh
bun test
```

Integration tests spawn real processes and touch the real filesystem/PATH,
using `node` as a guaranteed-present stand-in binary so the suite passes on any
machine regardless of which agent CLIs are installed.
