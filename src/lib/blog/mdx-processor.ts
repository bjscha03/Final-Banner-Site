/**
 * MDX Processing Utilities
 */

import matter from 'gray-matter';
import readingTime from 'reading-time';
import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import remarkHtml from 'remark-html';
import type { BlogFrontmatter, BlogPost, BlogListItem } from './types';

export function parseMDX(content: string): { frontmatter: BlogFrontmatter; content: string } {
  const { data, content: mdxContent } = matter(content);
  return {
    frontmatter: data as BlogFrontmatter,
    content: mdxContent,
  };
}

export async function markdownToHtml(markdown: string): Promise<string> {
  const result = await remark()
    .use(remarkGfm)
    .use(remarkHtml, { sanitize: false })
    .process(markdown);
  
  return result.toString();
}

export function calculateReadingTime(content: string): string {
  const stats = readingTime(content);
  return stats.text;
}

export function extractExcerpt(content: string, maxLength: number = 160): string {
  const plainText = content
    .replace(/^#+\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\n+/g, ' ')
    .trim();
  
  if (plainText.length <= maxLength) {
    return plainText;
  }
  
  return plainText.substring(0, maxLength).trim() + '...';
}

export async function processBlogPost(content: string): Promise<BlogPost> {
  const { frontmatter, content: mdxContent } = parseMDX(content);
  const html = await markdownToHtml(mdxContent);
  const readingTimeText = frontmatter.readingTime !== false 
    ? calculateReadingTime(mdxContent)
    : '';
  const excerpt = extractExcerpt(mdxContent);
  
  return {
    frontmatter,
    content: mdxContent,
    html,
    readingTime: readingTimeText,
    slug: frontmatter.slug,
    excerpt,
  };
}

export async function processBlogListItem(content: string): Promise<BlogListItem> {
  const { frontmatter, content: mdxContent } = parseMDX(content);
  const readingTimeText = frontmatter.readingTime !== false 
    ? calculateReadingTime(mdxContent)
    : '';
  const excerpt = extractExcerpt(mdxContent);
  
  return {
    frontmatter,
    excerpt,
    readingTime: readingTimeText,
    slug: frontmatter.slug,
  };
}
