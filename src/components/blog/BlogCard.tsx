/**
 * Blog Card Component
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { OptimizedImage } from './OptimizedImage';
import { TagPill } from './TagPill';
import type { BlogListItem } from '@/lib/blog';

interface BlogCardProps {
  post: BlogListItem;
}

export function BlogCard({ post }: BlogCardProps) {
  const { frontmatter, excerpt, readingTime } = post;
  
  // Handle both 'hero' and 'heroImage' field names
  // Handle both 'hero' and 'heroImage' field names
  const heroImageUrl = (frontmatter as any).heroImage || (frontmatter as any).hero || 'https://via.placeholder.com/640x360/18448D/ffffff?text=Blog+Post';
  
  return (
    <article className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-xl transition-shadow duration-300">
      <Link to={`/blog/${frontmatter.slug}`} className="block">
        <OptimizedImage
          src={heroImageUrl}
          alt={frontmatter.alt}
          width={640}
          className="w-full h-48 object-cover"
        />
      </Link>
      
      <div className="p-6">
        <div className="flex flex-wrap gap-2 mb-3">
          {frontmatter.tags.slice(0, 3).map(tag => (
            <TagPill key={tag} tag={tag} linkTo />
          ))}
        </div>
        
        <Link to={`/blog/${frontmatter.slug}`}>
          <h2 className="text-2xl font-bold text-gray-900 mb-2 hover:text-[#18448D] transition-colors">
            {frontmatter.title}
          </h2>
        </Link>
        
        <p className="text-gray-600 mb-4 line-clamp-3">{excerpt}</p>
        
        <div className="flex items-center justify-between text-sm text-gray-500">
          <time dateTime={frontmatter.publishDate || frontmatter.date}>
            {new Date(frontmatter.publishDate || frontmatter.date).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </time>
          {readingTime && <span>{readingTime}</span>}
        </div>
        
        <Link
          to={`/blog/${frontmatter.slug}`}
          className="inline-block mt-4 text-[#18448D] font-semibold hover:text-[#ff6b35] transition-colors"
        >
          Read More →
        </Link>
      </div>
    </article>
  );
}
