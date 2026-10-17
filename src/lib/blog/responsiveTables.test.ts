// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { marked } from 'marked';
import { withResponsiveTables } from './responsiveTables';

function originalMarkup(table: Element): string {
  const copy = table.cloneNode(true) as Element;
  for (const element of [copy, ...Array.from(copy.querySelectorAll('*'))]) {
    element.removeAttribute('data-mobile-cards');
    element.removeAttribute('data-column-label');
    element.removeAttribute('role');
  }
  return copy.outerHTML;
}

describe('responsive article tables', () => {
  it('keeps all cells, links and captions inside a keyboard-accessible scroll region', () => {
    const source = '<p>Intro</p><table><caption>Sizes</caption><thead><tr><th>Size</th><th>Details</th></tr></thead><tbody><tr><td>6×3</td><td><a href="/design">Design a banner</a></td></tr></tbody></table><p>After</p>';
    const root = document.createElement('div'); root.innerHTML = withResponsiveTables(source);
    const region = root.querySelector('.blog-table-scroll')!;
    expect(region.getAttribute('role')).toBe('region');
    expect(region.getAttribute('tabindex')).toBe('0');
    expect(originalMarkup(region.querySelector('table')!)).toBe(source.match(/<table[\s\S]*<\/table>/)![0]);
    expect(Array.from(region.querySelectorAll('td')).map(cell => cell.getAttribute('data-column-label'))).toEqual(['Size', 'Details']);
    expect(root.firstElementChild?.textContent).toBe('Intro');
    expect(root.lastElementChild?.textContent).toBe('After');
  });

  it('covers every table in every current article without changing its data', () => {
    const files = readdirSync('content/blog').filter(file => file.endsWith('.mdx'));
    let tableCount = 0;
    for (const file of files) {
      const source = readFileSync(`content/blog/${file}`, 'utf8').replace(/^---[\s\S]*?---\s*/, '');
      const html = marked.parse(source, { async: false, gfm: true }) as string;
      const before = document.createElement('div'); before.innerHTML = html;
      const after = document.createElement('div'); after.innerHTML = withResponsiveTables(html);
      const originals = Array.from(before.querySelectorAll('table'));
      const tables = Array.from(after.querySelectorAll('table'));
      expect(tables.length, file).toBe(originals.length);
      tables.forEach((table, index) => {
        expect(originalMarkup(table), file).toBe(originalMarkup(originals[index]));
        expect(table.parentElement?.className, file).toBe('blog-table-scroll');
        if (table.hasAttribute('data-mobile-cards')) {
          const headings = Array.from(table.querySelectorAll('thead th')).map(cell => cell.textContent?.trim());
          table.querySelectorAll('tbody tr').forEach(row => {
            expect(Array.from(row.querySelectorAll('td')).map(cell => cell.getAttribute('data-column-label')), file).toEqual(headings);
          });
        }
      });
      expect(after.querySelectorAll('.blog-table-hint').length, file).toBe(tables.length);
      tableCount += tables.length;
    }
    expect(tableCount).toBeGreaterThan(0);
    console.log(`Checked ${tableCount} tables across ${files.length} articles`);
  });

  it('retains a scrollable table for merged cells instead of assigning misleading labels', () => {
    const source = '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td colspan="2">Combined</td></tr></tbody></table>';
    const root = document.createElement('div'); root.innerHTML = withResponsiveTables(source);
    expect(root.querySelector('table')?.outerHTML).toBe(source);
    expect(root.querySelector('.blog-table-cards')).toBeNull();
  });

  it('safely labels formatted headings with quotation marks and entities', () => {
    const root = document.createElement('div');
    root.innerHTML = withResponsiveTables('<table><thead><tr><th><strong>Size &amp; "fit"</strong></th></tr></thead><tbody><tr><td>Value</td></tr></tbody></table>');
    expect(root.querySelector('td')?.getAttribute('data-column-label')).toBe('Size & "fit"');
  });

  it('leaves content without tables unchanged', () => {
    const html = '<h2>Artwork</h2><p>A paragraph and <a href="/design">link</a>.</p>';
    expect(withResponsiveTables(html)).toBe(html);
  });
});
