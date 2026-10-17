/** Give simple comparison tables labeled mobile rows; retain scrolling for merged cells. */
function withMobileLabels(table: string): string {
  if (/\b(?:rowspan|colspan)\s*=/i.test(table) || (table.match(/<table\b/gi)?.length ?? 0) !== 1) return table;
  const head = table.match(/<thead\b[^>]*>([\s\S]*?)<\/thead>/i);
  const body = table.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i);
  if (!head || !body || (head[1].match(/<tr\b/gi)?.length ?? 0) !== 1) return table;
  const labels = Array.from(head[1].matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi), match =>
    match[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().replace(/"/g, '&quot;'),
  );
  const rows = Array.from(body[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi));
  if (!labels.length || labels.some(label => !label) || !rows.length || rows.some(row =>
    /<th\b/i.test(row[1]) || (row[1].match(/<td\b/gi)?.length ?? 0) !== labels.length,
  )) return table;

  const labeledBody = body[0].replace(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi, row => {
    let column = 0;
    return row.replace(/<td\b([^>]*)>/gi, (_, attributes) =>
      `<td${attributes} data-column-label="${labels[column++]}">`,
    );
  });
  // Explicit roles preserve table semantics when mobile CSS changes display modes.
  return table.replace(body[0], labeledBody)
    .replace(/<table\b/, '<table data-mobile-cards="true"')
    .replace(/<(table|thead|tbody|tr|th|td)\b([^>]*)>/gi, (tag, name, attributes) => {
      const roles: Record<string, string> = { table: 'table', thead: 'rowgroup', tbody: 'rowgroup', tr: 'row', th: 'columnheader', td: 'cell' };
      return /\brole\s*=/i.test(attributes) ? tag : `<${name}${attributes} role="${roles[name.toLowerCase()]}">`;
    });
}

/** Wrap generated article tables before rendering, including server-rendered HTML. */
export function withResponsiveTables(html: string): string {
  let index = 0;
  return html.replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi, (table) => {
    index += 1;
    const labeledTable = withMobileLabels(table);
    const mobileCards = labeledTable !== table;
    return `<div class="blog-table-block${mobileCards ? ' blog-table-cards' : ''}"><p class="blog-table-hint">Swipe or scroll sideways to see all columns.</p><div class="blog-table-scroll" role="region" aria-label="Article table ${index}${mobileCards ? '' : ', scroll horizontally for more columns'}" tabindex="0">${labeledTable}</div></div>`;
  });
}
