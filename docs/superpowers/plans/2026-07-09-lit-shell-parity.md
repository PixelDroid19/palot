# Lit shell parity implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the React app frame with a Lit frame that matches the current desktop UI before migrating individual content routes.

**Architecture:** Keep React as an unmounted reference behind a local preview switch while Lit owns a second preview switch. Introduce Lit-native frame primitives and a desktop state store over the existing framework-neutral services. The default entrypoint changes only after screenshot and interaction parity passes.

**Tech Stack:** Lit 3, TypeScript, SCSS compiled by `scripts/scss-to-cssjs.ts`, Bun tests, Electron/Vite, browser screenshot QA.

## Global Constraints

- React is a temporary reference only; no React component may be mounted inside a Lit route.
- Lit styles are co-located SCSS compiled to `*.css.js`; generated CSS files are never hand-edited.
- Preserve `window.gcode.agentSession` and framework-neutral `renderer/services/` boundaries.
- Every switched route requires desktop screenshot comparison, primary interaction proof, console check, typecheck, test, and build.

---

### Task 1: Add a non-default Lit visual-preview entry

**Files:**
- Modify: `apps/desktop/src/renderer/main.tsx`
- Test: `apps/desktop/test/lit-shell-imports.test.ts`

**Interfaces:**
- Consumes: URL search parameter `shell=lit`.
- Produces: a Lit-only preview renderer while the default remains the React reference.

- [ ] Add a test that asserts the preview imports `./lit/main-lit` only when `shell=lit` and that the default imports `./app`.
- [ ] Make `main.tsx` select the preview at runtime with dynamic imports, importing `./index.css` in both branches.
- [ ] Run `cd apps/desktop && bun test test/lit-shell-imports.test.ts`.
- [ ] Capture React and Lit screenshots at `http://localhost:1420/` and `http://localhost:1420/?shell=lit`.
- [ ] Commit `test(desktop): add Lit parity preview entry`.

### Task 2: Port frame geometry and desktop chrome

**Files:**
- Modify: `apps/desktop/src/renderer/lit/components/gcode-app.ts`
- Modify: `apps/desktop/src/renderer/lit/components/gcode-app.scss`
- Modify: `apps/desktop/src/renderer/lit/components/gcode-sidebar.ts`
- Modify: `apps/desktop/src/renderer/lit/components/gcode-sidebar.scss`
- Create: `apps/desktop/test/lit-frame-parity.test.ts`

**Interfaces:**
- Consumes: `gcodeBus`, `sessionStore`, `navigate()`.
- Produces: titlebar, sidebar toggle, new-session action, content inset and responsive sidebar state.

- [ ] Add tests for a 46px app bar, a collapsible 280px sidebar, and `gcode-new-session` / `gcode-sidebar-toggle` events.
- [ ] Implement Lit app-bar and window controls with Electron drag/no-drag regions.
- [ ] Port sidebar collapse threshold and persist user choice in `gcode:sidebar-open`.
- [ ] Run the component tests and screenshot the frame at 1280px and 600px widths.
- [ ] Commit `feat(lit): match desktop frame and sidebar geometry`.

### Task 3: Port the React home/new-session visual contract

**Files:**
- Modify: `apps/desktop/src/renderer/lit/components/gcode-home.ts`
- Modify: `apps/desktop/src/renderer/lit/components/gcode-home.scss`
- Create: `apps/desktop/test/lit-home-parity.test.ts`

**Interfaces:**
- Consumes: `window.gcode.agentSession.describeRuntimes`, `window.gcode.pickDirectory`, `sessionStore`.
- Produces: suggestion cards, workspace selector, runtime controls, composer and launch action.

- [ ] Add tests for offline/empty, runtime-ready and launch-disabled states.
- [ ] Port the React home hierarchy: centered wordmark, heading, suggestion cards and bottom composer.
- [ ] Keep the current ACP session-launch behavior and directory picker.
- [ ] Compare the React and Lit viewports in browser mode, including the offline state.
- [ ] Commit `feat(lit): match new-session visual hierarchy`.

### Task 4: Establish reusable Lit visual primitives

**Files:**
- Create: `apps/desktop/src/renderer/lit/styles/_primitives.scss`
- Modify: `apps/desktop/src/renderer/lit/styles/_tokens.scss`
- Modify: `apps/desktop/src/renderer/lit/styles/base.scss`
- Create: `apps/desktop/test/lit-style-contract.test.ts`

**Interfaces:**
- Consumes: `--gcode-*` variables.
- Produces: shared button, input, card, segmented-control, menu and focus-ring styles.

- [ ] Add a test that asserts the required token and focus-state declarations exist.
- [ ] Copy values from the React reference instead of creating alternate colors or radii.
- [ ] Apply primitives to the shell and home without leaking styles outside shadow roots.
- [ ] Run `cd apps/desktop && bun run scss:build` and the Lit style tests.
- [ ] Commit `feat(lit): add parity visual primitives`.

### Task 5: Gate the app-frame switch

**Files:**
- Modify: `apps/desktop/src/renderer/main.tsx`
- Modify: `apps/desktop/test/brand-identity.test.ts`
- Modify: `apps/desktop/test/lit-shell-imports.test.ts`

**Interfaces:**
- Consumes: completed Tasks 1-4.
- Produces: Lit as the default renderer only if all app-frame checks pass.

- [ ] Run `bun run check-types`, `bun run test`, and `bun run build` from the repository root.
- [ ] Verify no relevant browser console errors and exercise sidebar toggle, settings navigation and new-session navigation.
- [ ] Switch the default entrypoint only after side-by-side evidence passes review.
- [ ] Commit `feat(desktop): switch the parity-verified Lit frame`.
