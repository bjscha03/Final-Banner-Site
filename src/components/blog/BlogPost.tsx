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
    
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    const headings = tempDiv.querySelectorAll('h2, h3');
    headings.forEach((heading, index) => {
      const id = heading.textContent?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || `heading-${index}`;
      const actualHeading = document.querySelector(`h2:nth-of-type(${index + 1}), h3:nth-of-type(${index + 1})`);
      if (actualHeading) {
        actualHeading.id = id;
      }
    });
  }, [frontmatter.slug, frontmatter.title, frontmatter.tags, readingTime, html]);
  
  const canonicalUrl = frontmatter.canonical || `https://bannersonthefly.com/blog/${frontmatter.slug}`;
  
  return (
    <article className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="max-w-4xl mx-auto mb-8">
        <Link to="/blog" className="inline-flex items-center text-[#18448D] hover:text-[#ff6b35] transition-colors mb-6">
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
        
        <header className="mb-8">
          <div className="flex flex-wrap gap-2 mb-4">
            {frontmatter.tags.map(tag => (
              <TagPill key={tag} tag={tag} linkTo />
            ))}
          </div>
          
          <h1 className="text-4xl lg:text-5xl font-bold text-gray-900 mb-4">
            {frontmatter.title}
          </h1>
          
          <div className="flex flex-wrap items-center gap-4 text-gray-600 mb-6">
            <time dateTime={frontmatter.date}>
              {new Date(frontmatter.date).toLocaleDateString('en-US', {
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
      
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8">
          <div className="prose prose-lg max-w-none mb-12" dangerouslySetInnerHTML={{ __html: html }} />
          
          <div className="border-t border-gray-200 pt-8 mb-8">
            <ShareButtons url={canonicalUrl} title={frontmatter.title} />
          </div>
          
          <StickyCTA position="mid" />
        </div>
        
        <aside className="lg:col-span-4">
          <TableOfContents content={html} />
          
          <div className="mt-8">
            <StickyCTA position="sticky" />
          </div>
        </aside>
      </div>
      
      {relatedPosts.length > 0 && (
        <section className="mt-16 pt-16 border-t border-gray-200">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">Related Articles</h2>
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
