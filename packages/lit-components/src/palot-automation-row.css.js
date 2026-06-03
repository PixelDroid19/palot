import { css } from "lit"

export const styles = css`
:host {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--palot-space-sm) var(--palot-space-md);
  border-bottom: 1px solid var(--palot-border);
  font-size: var(--palot-font-size-md);
}

.status {
  font-size: var(--palot-font-size-xs);
  padding: 1px var(--palot-space-sm);
  border-radius: var(--palot-radius-full);
  text-transform: lowercase;
}
`
