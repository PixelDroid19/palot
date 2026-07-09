/**
 * Generate lockup PNGs (icon + "GCode" wordmark) for README and brand assets.
 * Uses the GCode radar icon + Geist Mono wordmark (no external font files at runtime).
 *
 * Output: apps/desktop/resources/brand/lockup-light.png, lockup-dark.png
 */
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import sharp from "sharp"

const ROOT = join(import.meta.dir, "..")
const BRAND = join(ROOT, "apps/desktop/resources/brand")
const RESOURCES = join(ROOT, "apps/desktop/resources")

const w900 = readFileSync(
	join(ROOT, "node_modules/@fontsource/geist-mono/files/geist-mono-latin-900-normal.woff2"),
).toString("base64")
const w600 = readFileSync(
	join(ROOT, "node_modules/@fontsource/geist-mono/files/geist-mono-latin-600-normal.woff2"),
).toString("base64")

const fontFaces = `
  @font-face { font-family: 'GM'; font-weight: 900; src: url(data:font/woff2;base64,${w900}) format('woff2'); }
  @font-face { font-family: 'GM'; font-weight: 600; src: url(data:font/woff2;base64,${w600}) format('woff2'); }
`

function radarIcon(x: number, y: number, size: number, variant: "dark" | "light") {
	const s = size / 1024
	if (variant === "dark") {
		return `
    <g transform="translate(${x}, ${y}) scale(${s})">
      <defs>
        <radialGradient id="lk-bg" cx="50%" cy="50%" r="65%">
          <stop offset="0%" stop-color="#0f1629"/>
          <stop offset="100%" stop-color="#001a2b"/>
        </radialGradient>
        <radialGradient id="lk-dot" cx="40%" cy="38%" r="55%">
          <stop offset="0%" stop-color="#a8ddf7"/>
          <stop offset="50%" stop-color="#6fcbf3"/>
          <stop offset="100%" stop-color="#05bdf5"/>
        </radialGradient>
      </defs>
      <rect width="1024" height="1024" rx="224" fill="url(#lk-bg)"/>
      <circle cx="512" cy="512" r="420" fill="none" stroke="#6fcbf3" stroke-width="32" opacity="0.35"/>
      <circle cx="512" cy="512" r="250" fill="none" stroke="#6fcbf3" stroke-width="36" opacity="0.6"/>
      <circle cx="512" cy="512" r="160" fill="#05bdf5" opacity="0.2"/>
      <circle cx="512" cy="512" r="80" fill="url(#lk-dot)"/>
    </g>`
	}
	return `
    <g transform="translate(${x}, ${y}) scale(${s})">
      <defs>
        <radialGradient id="lk-bg" cx="50%" cy="50%" r="65%">
          <stop offset="0%" stop-color="#ecf7fd"/>
          <stop offset="100%" stop-color="#d3edf9"/>
        </radialGradient>
        <radialGradient id="lk-dot" cx="40%" cy="38%" r="55%">
          <stop offset="0%" stop-color="#05bdf5"/>
          <stop offset="50%" stop-color="#009fde"/>
          <stop offset="100%" stop-color="#006094"/>
        </radialGradient>
      </defs>
      <rect width="1024" height="1024" rx="224" fill="url(#lk-bg)"/>
      <circle cx="512" cy="512" r="420" fill="none" stroke="#0080bd" stroke-width="32" opacity="0.35"/>
      <circle cx="512" cy="512" r="250" fill="none" stroke="#0080bd" stroke-width="36" opacity="0.6"/>
      <circle cx="512" cy="512" r="160" fill="#009fde" opacity="0.15"/>
      <circle cx="512" cy="512" r="80" fill="url(#lk-dot)"/>
    </g>`
}

async function generate() {
	const iconSize = 120
	const gap = 28
	const padX = 32
	const padY = 28
	const fontSize = 64
	// Approximate monospace width for "GCode" (5 chars)
	const textWidth = 5 * (fontSize * 0.62)
	const totalWidth = padX + iconSize + gap + textWidth + padX
	const totalHeight = Math.max(iconSize, fontSize) + padY * 2
	const iconX = padX
	const iconY = (totalHeight - iconSize) / 2
	const textX = padX + iconSize + gap
	const textY = totalHeight / 2 + fontSize * 0.35

	for (const [name, bg, fill] of [
		["lockup-light.png", "#ffffff", "#0f172a"],
		["lockup-dark.png", "#0a0a0a", "#f8fafc"],
	] as const) {
		const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${totalHeight}" width="${totalWidth * 3}" height="${totalHeight * 3}">
  <defs><style>${fontFaces}</style></defs>
  <rect width="${totalWidth}" height="${totalHeight}" fill="${bg}"/>
  ${radarIcon(iconX, iconY, iconSize, name.includes("dark") ? "dark" : "light")}
  <text x="${textX}" y="${textY}" font-family="GM" font-size="${fontSize}" font-weight="900" fill="${fill}" letter-spacing="2">GCode</text>
</svg>`
		const buf = await sharp(Buffer.from(svg)).png().toBuffer()
		writeFileSync(join(BRAND, name), buf)
		console.log("  -> brand/" + name)
	}

	// Standalone wordmark SVG (text-based, currentColor for CSS theming)
	const wmSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 48" fill="none">
  <!-- GCode wordmark (Geist Mono style metrics; rendered as text for crisp branding) -->
  <text x="0" y="36" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="36" font-weight="800" fill="currentColor" letter-spacing="1.5">GCode</text>
</svg>
`
	writeFileSync(join(RESOURCES, "wordmark.svg"), wmSvg)
	console.log("  -> resources/wordmark.svg")
}

generate().catch((e) => {
	console.error(e)
	process.exit(1)
})
