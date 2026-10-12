// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { marked } from 'marked';
import { withResponsiveTables } from './responsiveTables';

describe('responsive article tables', () => {
  it('keeps all cells, links and captions inside a keyboard-accessible scroll region', () => {
    const source = '<p>Intro</p><table><caption>Sizes</caption><thead><tr><th>Size</th><th>Details</th></tr></thead><tbody><tr><td>6×3</td><td><a href="/design">Design a banner</a></td></tr></tbody></table><p>After</p>';
    const root = document.createElement('div'); root.innerHTML = withResponsiveTables(source);
    const region = root.querySelector('.blog-table-scroll')!;
    expect(region.getAttribute('role')).toBe('region');
    expect(region.getAttribute('tabindex')).toBe('0');
    expect(region.querySelector('table')?.outerHTML).toBe(source.match(/<table[\s\S]*<\/table>/)![0]);
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
        expect(table.outerHTML, file).toBe(originals[index].outerHTML);
        expect(table.parentElement?.className, file).toBe('blog-table-scroll');
      });
      expect(after.querySelectorAll('.blog-table-hint').length, file).toBe(tables.length);
      tableCount += tables.length;
    }
    expect(tableCount).toBeGreaterThan(0);
    console.log(`Checked ${tableCount} tables across ${files.length} articles`);
  });

  it('leaves content without tables unchanged', () => {
    const html = '<h2>Artwork</h2><p>A paragraph and <a href="/design">link</a>.</p>';
    expect(withResponsiveTables(html)).toBe(html);
  });
});
