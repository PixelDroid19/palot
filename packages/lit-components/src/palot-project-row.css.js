import { css } from "lit"

export const styles = css`
:host {
  display: block;
}

.row {
  display: flex;
  justify-content: space-between;
  padding: var(--palot-space-sm) var(--palot-space-md);
  font-size: var(--palot-font-size-md);
  border-radius: var(--palot-radius-sm);
}
`
