import { css } from "lit"

export const styles = css`
:host {
  display: inline-flex;
}

button.icon {
  display: inline-flex;
  align-items: center;
  gap: var(--palot-space-xs);
  padding: var(--palot-space-xs) var(--palot-space-sm);
  border: 1px solid var(--palot-border);
  border-radius: var(--palot-radius-sm);
  background: transparent;
  color: var(--palot-text);
  cursor: pointer;
  font-size: var(--palot-font-size-sm);
}

button.icon:hover {
  background: var(--palot-bg-elevated);
}

button.icon.selected {
  border-color: var(--palot-accent);
  font-weight: var(--palot-font-weight-medium);
}

.sym {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: var(--palot-radius-full);
  background: var(--palot-accent);
  color: #fff;
  font-size: var(--palot-font-size-xs);
  font-family: var(--palot-font-mono);
}

.label {
  white-space: nowrap;
}
`
