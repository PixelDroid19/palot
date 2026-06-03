# @palot/tokens

Shared design tokens for the Palot platform.

- CSS custom properties (`--palot-*`) in `theme.css`
- TypeScript constants for colors, spacing, typography, radius (usable from React or Lit)

## Usage

**CSS (Lit or global):**

```css
:host {
  color: var(--palot-color-foreground);
  padding: var(--palot-spacing-2);
}
```

Import the theme once (e.g. in app root or globals):

```ts
import "@palot/tokens/theme.css" // or copy vars
```

**TS (React components or Lit props):**

```ts
import { colors, spacing } from "@palot/tokens"
```

Subpath exports also available: `@palot/tokens/colors` etc.

## Role

Foundation for both the React `@palot/ui` compatibility layer and the portable `@palot/lit-components`.

See `roadmap/lit-migration.md` (avoid Tailwind in portable components), `packages/ui/src/styles/globals.css`.

## Related

- `@palot/lit-styles`
- `@palot/lit-components`
- `@palot/ui`
- `docs/IMPORT-ARCHITECTURE.md`
