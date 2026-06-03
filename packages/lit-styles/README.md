# @palot/lit-styles

The build pipeline and Vite plugin that turns per-component `.scss` into portable `lit` `css` tagged template literals + matching `.d.ts`.

## Pipeline

- Edit only `palot-foo.scss` next to `palot-foo.ts`
- Generator produces `palot-foo.css.js` (committed) and `.d.ts`
- `import { styles } from "./palot-foo.css.js"` inside the Lit component
- Vite plugin (`palotLitScss()`) provides HMR / watch during `dev`

## Scripts

From repo root (recommended):

```bash
bun run build:styles
```

(Delegated via turbo `build:styles` task; also available inside lit-components and lit-styles.)

## Usage in Vite config (desktop)

```ts
import { palotLitScss } from "@palot/lit-styles/vite-plugin"
// ...
plugins: [..., palotLitScss()]
```

See source `build-scss-css-js.ts` and `vite-plugin-palot-lit-scss.ts`.

## Why

Per lit-migration.md: Lit components must own their styles locally (no Tailwind utilities inside portable components; use shared CSS custom props from `@palot/tokens`).

## Related

- `@palot/lit-components`
- `@palot/tokens`
- `roadmap/lit-migration.md`
- `docs/IMPORT-ARCHITECTURE.md`
