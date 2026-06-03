import { css } from "lit"

export const styles = css`
:host {
  display: block;
  font-family: var(--palot-font-sans);
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--palot-space-sm) var(--palot-space-md);
  border-radius: var(--palot-radius-md);
  cursor: pointer;
  user-select: none;
  font-size: var(--palot-font-size-md);
  color: var(--palot-text);
  border: 1px solid transparent;
}

.row:hover {
  background: var(--palot-bg-elevated);
}

.row.active {
  background: var(--palot-bg-elevated);
  border-color: var(--palot-accent);
  font-weight: var(--palot-font-weight-medium);
}

.title {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.status {
  font-size: var(--palot-font-size-xs);
  color: var(--palot-text-muted);
  margin-left: var(--palot-space-sm);
  text-transform: lowercase;
}
`
