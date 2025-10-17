/**
 * Blog Type Definitions
 */

export interface BlogFrontmatter {
  title: string;
  slug: string;
  description: string;
  date: string;
  updated?: string;
  author: string;
  tags: string[];
  hero: string;
  alt: string;
  readingTime?: boolean;
  canonical?: string;
  noindex?: boolean;
  draft?: boolean;
}

export interface BlogPost {
  frontmatter: BlogFrontmatter;
  content: string;
  html: string;
  readingTime: string;
  slug: string;
  excerpt: string;
}

export interface BlogListItem {
  frontmatter: BlogFrontmatter;
  excerpt: string;
  readingTime: string;
  slug: string;
}

export interface PaginatedPosts {
  posts: BlogListItem[];
  currentPage: number;
  totalPages: number;
  totalPosts: number;
}
