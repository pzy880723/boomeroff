function inline(text) {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map(part => part.startsWith('**') && part.endsWith('**') ? { name: 'strong', children: [{ type: 'text', text: part.slice(2, -2) }] } : { type: 'text', text: part });
}
function cells(line) { return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(s => s.trim()); }
function parse(body) {
  const lines = body.replace(/\r\n?/g, '\n').split('\n'), blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]; if (!line.trim()) continue;
    if (i + 1 < lines.length && line.indexOf('|') >= 0 && /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[i + 1])) {
      const rows = [{ header: true, cells: cells(line).map(inline) }]; i++;
      while (i + 1 < lines.length && lines[i + 1].trim() && lines[i + 1].indexOf('|') >= 0) rows.push({ header: false, cells: cells(lines[++i]).map(inline) });
      blocks.push({ kind: 'table', rows }); continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line), list = /^\s*(?:[-*+]\s+|\d+\.\s+)(.*)$/.exec(line);
    blocks.push({ kind: heading ? 'heading' : list ? 'list' : 'text', nodes: inline(heading ? heading[2] : list ? list[1] : line) });
  }
  return blocks;
}
module.exports = { parse };
