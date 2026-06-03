# Lit Components Migration

## Goal

Move Palot toward Lit Web Components for easier customization, long-term
maintenance, and component portability. The migration should be incremental.
The current Electron app can host React and Lit at the same time while the core
is extracted.

The goal is not simply to rewrite JSX as Lit templates. The goal is to make UI
components thin, reusable, and driven by framework-neutral view models.

## Recommended Package Structure

```text
packages/
  tokens/
    src/
      colors.ts
      spacing.ts
      typography.ts
      theme.css
      index.ts
  lit-styles/
    src/
      build-scss-css-js.ts
      vite-plugin-palot-lit-scss.ts
      index.ts
  lit-components/
    src/
      components/
        palot-session-row/
          palot-session-row.ts
          palot-session-row.scss
          palot-session-row.css.js
          palot-session-row.test.ts
          index.ts
        palot-chat-input/
          palot-chat-input.ts
          palot-chat-input.scss
          palot-chat-input.css.js
          palot-chat-input.test.ts
          index.ts
      index.ts
```

Each component should be individually portable:

- unique `palot-*` tag
- local TypeScript file
- local SCSS file
- generated local `css.js` file
- typed properties
- typed `CustomEvent` contracts
- isolated tests
- individual export

## Component Rules

Lit components must not import:

- React
- Jotai
- Electron
- Node builtins
- `window.palot`
- OpenCode, Codex, Claude Code, or other provider SDKs

Lit components should:

- receive data through properties
- emit user intent through DOM events
- render accessible markup
- use local styles through generated `css.js`
- use shared design tokens through CSS custom properties
- stay useful outside the Palot Electron app

## Example Component

```ts
import { LitElement, html } from "lit"
import { customElement, property } from "lit/decorators.js"
import { styles } from "./palot-session-row.css.js"

export interface PalotSessionSelectedDetail {
  sessionId: string
}

@customElement("palot-session-row")
export class PalotSessionRow extends LitElement {
  static styles = styles

  @property({ type: String, attribute: "session-id" })
  sessionId = ""

  @property({ type: String })
  title = ""

  private emitSelected() {
    this.dispatchEvent(
      new CustomEvent<PalotSessionSelectedDetail>("palot-session-selected", {
        bubbles: true,
        composed: true,
        detail: { sessionId: this.sessionId },
      }),
    )
  }

  render() {
    return html`
      <button type="button" @click=${this.emitSelected}>
        <span>${this.title}</span>
      </button>
    `
  }
}
```

## SCSS To `css.js`

Each Lit component should use this file pattern:

```text
palot-chat-input.ts
palot-chat-input.scss
palot-chat-input.css.js
```

The component imports only the generated file:

```ts
import { styles } from "./palot-chat-input.css.js"
```

Generated file format:

```js
import { css } from "lit"

export const styles = css`
  :host {
    display: block;
  }
`
```

Pipeline requirements:

- Developers edit SCSS, not generated `css.js`.
- Dev watcher regenerates `css.js` every time a component SCSS file changes.
- Build regenerates all `css.js` files before typecheck and bundle steps.
- The generator fails on invalid SCSS.
- Output is deterministic.
- Generated files can be committed for package portability.
- The generator should support sourcemap-like comments only if they do not make
  diffs noisy.
- If imports require declarations, generate matching `.d.ts` files.

Recommended scripts:

```json
{
  "scripts": {
    "build:styles": "bun packages/lit-styles/src/build-scss-css-js.ts",
    "watch:styles": "bun packages/lit-styles/src/build-scss-css-js.ts --watch",
    "dev:lit": "bun run watch:styles"
  }
}
```

## Styling Recommendations

- Use CSS custom properties from shared tokens.
- Avoid Tailwind utility classes inside Lit components.
- Keep global glass/window effects in the app shell, not in portable components.
- Use Shadow DOM for components that should be isolated.
- Use light DOM only when composition with app-level CSS is explicitly needed.
- Keep component dimensions stable to avoid layout shifts.
- Prefer compact, utilitarian UI density for Palot surfaces.

## DOM Events From Components

Recommended event names:

- `palot-session-selected`
- `palot-project-selected`
- `palot-prompt-submit`
- `palot-prompt-abort`
- `palot-permission-responded`
- `palot-question-replied`
- `palot-command-selected`
- `palot-settings-changed`
- `palot-automation-action`

Every component event should:

- include typed `detail`
- use stable ids
- be serializable when possible
- set `bubbles: true`
- set `composed: true`
- be covered by tests

## How Lit Talks To The Platform

```text
Lit component
  emits DOM event

Host adapter
  converts DOM event to Palot command

Command bus
  dispatches command

Provider adapter or native port
  performs operation

Event bus
  publishes canonical Palot events

Core reducers and view models
  update state snapshots

Lit component
  receives new properties
```

The component never calls the provider directly.

## Migration Order

### 1. Foundation

- Add `lit`.
- Add `sass`.
- Add `packages/lit-styles`.
- Add `packages/lit-components`.
- Add or extract `packages/tokens`.
- Add one small component and prove React can host it.
- Add style generation and a watcher.

### 2. Leaf Components

Start with low-risk components:

- session row
- project row
- status badge
- provider icon
- provider avatar
- toolbar icon button
- model option item
- permission item
- question option item
- attachment preview

These components should receive data and emit events only.

### 3. Composed Components

After view models exist:

- sidebar tree
- prompt toolbar
- chat input
- permission panel
- question panel
- automation run row
- settings row
- settings section

### 4. Full Surfaces

Migrate larger surfaces only when their state and use cases have moved to core:

- chat view
- new chat
- automations inbox
- settings
- onboarding

### 5. Shell

The final shell can remain Electron + Vite. React and Jotai can be removed only
after routing, layout, state, and all core interactions no longer require them.

## Acceptance Criteria Per Component

- Tag name uses `palot-*`.
- Component has a local `.scss` file.
- Component imports a generated `.css.js` file.
- Component has typed properties.
- Component has typed events.
- Component does not import forbidden runtimes.
- Component has render and event tests.
- Component can be imported individually.
- Component can be used from the current React host.

