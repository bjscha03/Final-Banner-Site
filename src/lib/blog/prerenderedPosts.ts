/**
 * Synchronously available editorial articles for initial HTML and hydration.
 * Keep the MDX file as the single source of truth. Other blog posts retain
 * their existing asynchronous loading path.
 */
import { marked } from 'marked';
import aiDesignerSource from '../../../content/blog/how-to-create-vinyl-banner-with-ai.mdx?raw';
import { parseMDX, calculateReadingTime, extractExcerpt } from './mdx-processor';
import type { BlogPost } from './types';

const { frontmatter, content } = parseMDX(aiDesignerSource);
const aiDesignerPost: BlogPost = {
  frontmatter,
  content,
  html: marked.parse(content, { async: false, gfm: true }) as string,
  readingTime: frontmatter.readingTime === false ? '' : calculateReadingTime(content),
  slug: frontmatter.slug,
  excerpt: extractExcerpt(content),
};

export function getPrerenderedPost(slug: string | undefined): BlogPost | null {
  return slug === aiDesignerPost.slug && !aiDesignerPost.frontmatter.draft
    ? aiDesignerPost
    : null;
}
