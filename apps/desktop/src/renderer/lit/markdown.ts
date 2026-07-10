/** Safe, framework-neutral Markdown subset used by Lit chat surfaces. */
function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;")
}

function inline(value: string): string {
	return escapeHtml(value)
		.replace(/`([^`]+)`/g, "<code>$1</code>")
		.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
		.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
}

/** Render common agent-response Markdown without accepting raw HTML. */
export function renderSafeMarkdown(source: string): string {
	const blocks = source.replace(/\r\n/g, "\n").split(/\n```([^\n]*)\n([\s\S]*?)```/g)
	return blocks
		.map((block, index) => {
			if (index % 3 === 2) {
				const language = blocks[index - 1]?.trim()
				return `<pre><code${language ? ` data-language="${escapeHtml(language)}"` : ""}>${escapeHtml(block)}</code></pre>`
			}
			if (index % 3 === 1) return ""
			return block
				.split(/\n{2,}/)
				.map((paragraph) => {
					const lines = paragraph.split("\n")
					if (lines.every((line) => /^\s*[-*+]\s+/.test(line))) {
						return `<ul>${lines.map((line) => `<li>${inline(line.replace(/^\s*[-*+]\s+/, ""))}</li>`).join("")}</ul>`
					}
					if (lines.every((line) => /^\s*\d+\.\s+/.test(line))) {
						return `<ol>${lines.map((line) => `<li>${inline(line.replace(/^\s*\d+\.\s+/, ""))}</li>`).join("")}</ol>`
					}
					return lines
						.map((line) => {
							const heading = /^(#{1,3})\s+(.+)$/.exec(line)
							if (heading) {
								const level = heading[1]!.length
								return `<h${level}>${inline(heading[2]!)}</h${level}>`
							}
							if (line.startsWith("> ")) return `<blockquote>${inline(line.slice(2))}</blockquote>`
							return inline(line)
						})
						.join("<br>")
						.replace(/^(?!<h\d|<blockquote)/, "<p>")
						.replace(/(?<!>)$/, "</p>")
				})
				.join("")
		})
		.join("")
}
