/** Ambient types for SCSS→css.js Lit style modules. */
declare module "*.css.js" {
	import type { CSSResult } from "lit"
	export const styles: CSSResult
	export default styles
}
