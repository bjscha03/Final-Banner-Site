/**
 * Blog Post Component
 */

import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { OptimizedImage } from './OptimizedImage';
import { TagPill } from './TagPill';
import { ShareButtons } from './ShareButtons';
import { StickyCTA } from './StickyCTA';
import { TableOfContents } from './TableOfContents';
import { BlogCard } from './BlogCard';
import type { BlogPost as BlogPostType, BlogListItem } from '@/lib/blog';

interface BlogPostProps {
  post: BlogPostType;
  relatedPosts: BlogListItem[];
}

export function BlogPost({ post, relatedPosts }: BlogPostProps) {
  const { frontmatter, html, readingTime } = post;
  
  // Handle both 'hero' and 'heroImage' field names
  const heroImageUrl = (frontmatter as any).heroImage || (frontmatter as any).hero || 'https://via.placeholder.com/1200x600/18448D/ffffff?text=Blog+Post+Image';
  
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', 'blog_view', {
        slug: frontmatter.slug,
        tags: frontmatter.tags.join(','),
        read_time: readingTime,
      });
    }
    
    if (typeof window !== 'undefined' && (window as any).fbq) {
      (window as any).fbq('track', 'ViewContent', {
        content_name: frontmatter.title,
        content_category: 'Blog',
        content_ids: [frontmatter.slug],
      });
    }
    
    // Add IDs to headings for TOC navigation
    const articleElement = document.querySelector('article .prose');
    if (articleElement) {
      const headings = articleElement.querySelectorAll('h2, h3');
      headings.forEach((heading) => {
        const text = heading.textContent || '';
        // Generate ID matching the TOC component's logic
        const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        if (id) {
          heading.id = id;
        }
      });
    }
  }, [frontmatter.slug, frontmatter.title, frontmatter.tags, readingTime, html]);
  
  const canonicalUrl = frontmatter.canonical || `https://bannersonthefly.com/blog/${frontmatter.slug}`;
  
  return (
    <article className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <div className="max-w-4xl mx-auto mb-8">
        <Link 
          to="/blog" 
          className="inline-flex items-center text-[#18448D] hover:text-[#ff6b35] transition-colors mb-6 font-semibold group min-h-[44px]"
        >
          <svg className="w-5 h-5 mr-2 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Blog
        </Link>
        
        <OptimizedImage
          src={heroImageUrl}
          alt={frontmatter.alt}
          width={1200}
          className="w-full h-96 rounded-lg mb-8"
          priority
        />
        
        <header className="mb-10">
          <div className="flex flex-wrap gap-2 mb-6">
            {frontmatter.tags.map(tag => (
              <TagPill key={tag} tag={tag} linkTo />
            ))}
          </div>
          
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-gray-900 mb-6 leading-tight tracking-tight">
            {frontmatter.title}
          </h1>
          
          <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-sm sm:text-base text-gray-600 mb-6">
            <time dateTime={frontmatter.publishDate || frontmatter.date}>
              {new Date(frontmatter.publishDate || frontmatter.date).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </time>
            {readingTime && <span>• {readingTime}</span>}
            <span>• By {frontmatter.author}</span>
          </div>
          
          <ShareButtons url={canonicalUrl} title={frontmatter.title} />
        </header>
      </div>
      
      {/* Table of Contents - Top on mobile, sidebar on desktop */}
      <div className="lg:hidden mb-8">
        <TableOfContents content={html} />
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8">
          <div 
            className="prose prose-base sm:prose-lg max-w-none mb-12
              prose-headings:font-bold prose-headings:tracking-tight
              prose-h2:text-2xl prose-h2:sm:text-3xl prose-h2:mt-12 prose-h2:mb-6 prose-h2:text-gray-900 prose-h2:border-b prose-h2:border-gray-200 prose-h2:pb-3
              prose-h3:text-xl prose-h3:sm:text-2xl prose-h3:mt-8 prose-h3:mb-4 prose-h3:text-gray-800
              prose-p:text-gray-700 prose-p:leading-relaxed prose-p:mb-6
              prose-a:text-[#18448D] prose-a:font-semibold prose-a:no-underline hover:prose-a:text-[#ff6b35] hover:prose-a:underline prose-a:transition-colors
              prose-strong:text-gray-900 prose-strong:font-bold
              prose-ul:my-6 prose-li:my-2 prose-li:text-gray-700
              prose-table:border-collapse prose-table:w-full prose-table:my-8
              prose-th:bg-gray-100 prose-th:p-3 prose-th:text-left prose-th:font-bold prose-th:text-gray-900 prose-th:border prose-th:border-gray-300
              prose-td:p-3 prose-td:border prose-td:border-gray-300 prose-td:text-gray-700
              prose-blockquote:border-l-4 prose-blockquote:border-[#18448D] prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-gray-700
              prose-code:text-[#18448D] prose-code:bg-gray-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm
            " 
            dangerouslySetInnerHTML={{ __html: html }} 
          />
          
          <div className="border-t-2 border-gray-200 pt-8 mb-8">
            <p className="text-sm font-semibold text-gray-700 mb-4">Share this article:</p>
            <ShareButtons url={canonicalUrl} title={frontmatter.title} />
          </div>
          
          <StickyCTA position="mid" />
        </div>
        
        <aside className="hidden lg:block lg:col-span-4">
          <TableOfContents content={html} />
          
          <div className="mt-8">
            <StickyCTA position="sticky" />
          </div>
        </aside>
      </div>
      
      {relatedPosts.length > 0 && (
        <section className="mt-16 pt-16 border-t-2 border-gray-200">
          <h2 className="text-2xl sm:text-3xl font-black text-gray-900 mb-8 tracking-tight">Related Articles</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {relatedPosts.map(post => (
              <BlogCard key={post.slug} post={post} />
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
