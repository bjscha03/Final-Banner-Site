/** Wrap generated article tables before rendering, including server-rendered HTML. */
export function withResponsiveTables(html: string): string {
  let index = 0;
  return html.replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi, (table) => {
    index += 1;
    return `<div class="blog-table-block"><p class="blog-table-hint">Swipe or scroll sideways to see all columns.</p><div class="blog-table-scroll" role="region" aria-label="Article table ${index}, scroll horizontally for more columns" tabindex="0">${table}</div></div>`;
  });
}
