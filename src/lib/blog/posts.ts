/**
 * Blog Post Retrieval Functions
 */

import { processBlogPost, processBlogListItem } from './mdx-processor';
import type { BlogPost, BlogListItem, PaginatedPosts } from './types';

const postModules = import.meta.glob('/content/blog/*.mdx', { as: 'raw', eager: true });

export async function getAllPosts(includeDrafts: boolean = false): Promise<BlogListItem[]> {
  const posts: BlogListItem[] = [];
  
  for (const [path, content] of Object.entries(postModules)) {
    try {
      const post = await processBlogListItem(content as string);
      
      if (!includeDrafts && post.frontmatter.draft) {
        continue;
      }
      
      posts.push(post);
    } catch (error) {
      console.error(`Error processing ${path}:`, error);
    }
  }
  
  posts.sort((a, b) => {
    const dateA = new Date(a.frontmatter.date).getTime();
    const dateB = new Date(b.frontmatter.date).getTime();
    return dateB - dateA;
  });
  
  return posts;
}

export async function getPostBySlug(slug: string): Promise<BlogPost | null> {
  for (const [path, content] of Object.entries(postModules)) {
    try {
      const post = await processBlogPost(content as string);
      
      if (post.slug === slug && !post.frontmatter.draft) {
        return post;
      }
    } catch (error) {
      console.error(`Error processing ${path}:`, error);
    }
  }
  
  return null;
}

export async function getPostsByTag(tag: string): Promise<BlogListItem[]> {
  const allPosts = await getAllPosts();
  
  return allPosts.filter(post =>
    post.frontmatter.tags.some(t => t.toLowerCase() === tag.toLowerCase())
  );
}

export async function getAllTags(): Promise<string[]> {
  const allPosts = await getAllPosts();
  const tagSet = new Set<string>();
  
  allPosts.forEach(post => {
    post.frontmatter.tags.forEach(tag => tagSet.add(tag));
  });
  
  return Array.from(tagSet).sort();
}

export async function getRelatedPosts(
  currentSlug: string,
  tags: string[],
  limit: number = 3
): Promise<BlogListItem[]> {
  const allPosts = await getAllPosts();
  
  const scoredPosts = allPosts
    .filter(post => post.slug !== currentSlug)
    .map(post => {
      const matchingTags = post.frontmatter.tags.filter(tag =>
        tags.some(t => t.toLowerCase() === tag.toLowerCase())
      );
      return {
        post,
        score: matchingTags.length,
      };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score);
  
  return scoredPosts.slice(0, limit).map(item => item.post);
}

export function paginatePosts(
  posts: BlogListItem[],
  page: number,
  postsPerPage: number
): PaginatedPosts {
  const totalPosts = posts.length;
  const totalPages = Math.ceil(totalPosts / postsPerPage);
  const currentPage = Math.max(1, Math.min(page, totalPages));
  const startIndex = (currentPage - 1) * postsPerPage;
  const endIndex = startIndex + postsPerPage;
  
  return {
    posts: posts.slice(startIndex, endIndex),
    currentPage,
    totalPages,
    totalPosts,
  };
}
