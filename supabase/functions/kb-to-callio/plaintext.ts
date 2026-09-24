// Converts a knowledge_base article body (the app's markdown-ish format that
// formatContent() in index.html renders) into plain text for Callio:
// no images/base64, no embeds, no markup — just readable text and link URLs.
export function toPlainText(raw: string | null | undefined): string {
  let s = raw ?? ''

  s = s
    // Embedded iframes/HTML blocks
    .replace(/\[EMBED\][\s\S]*?\[\/EMBED\]/g, '')
    // Images: ![alt](url){opts} — base64 or URL
    .replace(/!\[[^\]]*\]\([^)]*\)(\{[^}]*\})?/g, '')
    // Any stray base64 data URI left over
    .replace(/data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi, '')
    // Font size: [size:large]text[/size]
    .replace(/\[size:[a-z]+\]([\s\S]*?)\[\/size\]/g, '$1')
    // Links: [text](url) → "text (url)", or just the url if text == url
    .replace(/\[([^\]]+?)\]\(([^)]+?)\)/g, (_m, text: string, url: string) =>
      text.trim() === url.trim() ? url : `${text} (${url})`)
    // Bold / bold+italic
    .replace(/\*\*\*([^*]+?)\*\*\*/g, '$1')
    .replace(/\*\*([^*]+?)\*\*/g, '$1')
    // Unpaired leftover ** (authoring typos)
    .replace(/\*{2,}/g, '')
    // Italic: _text_ (same boundaries as formatContent, so URLs are untouched)
    .replace(/(?<=[\s,;:]|^)_([^_\s][^_]*[^_\s]|[^_\s])_(?=[\s,;:.]|$)/gm, '$1')
    // HTML tags (<u>, <br>, pasted markup)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')

  const lines = s.split('\n').map((line) => {
    const lead = (line.match(/^[ \t]*/) ?? [''])[0]
    const l = line.trim()
    if (/^─+$/.test(l)) return ''
    if (/^#{1,6}\s+/.test(l)) return l.replace(/^#{1,6}\s+/, '')
    if (l.startsWith('▸ ')) return l.slice(2)
    if (l.startsWith('• ')) return lead + '- ' + l.slice(2)
    if (/^(-\s+|\*(?!\*)\s*)/.test(l)) return lead + '- ' + l.replace(/^(-\s+|\*(?!\*)\s*)/, '')
    return line.replace(/\s+$/, '')
  })

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
