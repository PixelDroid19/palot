/**
 * Renderer entry point.
 *
 * The desktop product is mounted through the Lit shell. Keeping this tiny
 * indirection lets electron-vite retain its configured entry file while the
 * actual component registration and boot sequence live beside the Lit app.
 */
import "./lit/main-lit"
