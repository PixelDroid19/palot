import { css } from "lit"

export const styles = css`
:host {
  display: block;
}

.opt {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--palot-space-xs) var(--palot-space-sm);
  border-radius: var(--palot-radius-sm);
  cursor: pointer;
  font-size: var(--palot-font-size-sm);
}

.opt:hover {
  background: var(--palot-bg-elevated);
}

.opt.selected {
  background: var(--palot-bg-elevated);
  border: 1px solid var(--palot-accent);
  font-weight: var(--palot-font-weight-medium);
}

.model {
  flex: 1;
  font-family: var(--palot-font-mono);
}

.prov {
  font-size: var(--palot-font-size-xs);
  color: var(--palot-text-muted);
  margin-left: var(--palot-space-sm);
}
`
