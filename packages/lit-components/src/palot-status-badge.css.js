import { css } from "lit"

export const styles = css`
:host {
  display: inline-flex;
  align-items: center;
  padding: 1px var(--palot-space-sm);
  border-radius: var(--palot-radius-full);
  font-size: var(--palot-font-size-xs);
  line-height: 1;
  text-transform: lowercase;
  border: 1px solid var(--palot-border);
  color: var(--palot-text-muted);
  background: transparent;
}

:host([status=busy]) {
  color: var(--palot-accent);
  border-color: var(--palot-accent);
}

:host([status=error]) {
  color: var(--palot-danger);
  border-color: var(--palot-danger);
}

:host([status=idle]) {
  color: var(--palot-success);
  border-color: var(--palot-success);
}
`
