/**
 * Progressive Lit registration (side-effect imports).
 * Product boot stays React (`main.tsx` → `App`). Only slices wired from React
 * mount as custom elements — do not boot a parallel Lit product shell here.
 */
import "./components/gcode-wordmark"
import "./components/gcode-runtime-mark"
import "./components/gcode-status-dot"
import "./components/gcode-tool-card"
// Experimental / unmounted product prototypes (not default UI):
import "./components/gcode-app"
import "./components/gcode-automations"
import "./components/gcode-chat-panel"
import "./components/gcode-composer"
import "./components/gcode-home"
import "./components/gcode-onboarding"
import "./components/gcode-settings-panel"
import "./components/gcode-sidebar"
