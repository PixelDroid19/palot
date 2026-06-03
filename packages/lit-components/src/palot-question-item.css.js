import { css } from "lit"

export const styles = css`
:host {
  display: block;
  padding: var(--palot-space-sm) var(--palot-space-md);
  border: 1px solid var(--palot-border);
  border-radius: var(--palot-radius-md);
}

.prompt {
  margin-bottom: var(--palot-space-sm);
}

.options {
  display: flex;
  flex-wrap: wrap;
  gap: var(--palot-space-sm);
}

button {
  font: inherit;
  padding: var(--palot-space-xs) 10px;
  border-radius: var(--palot-radius-sm);
  border: 1px solid var(--palot-border);
  background: var(--palot-bg-elevated);
  color: var(--palot-text);
  cursor: pointer;
}

button:hover {
  border-color: var(--palot-accent);
}
`
