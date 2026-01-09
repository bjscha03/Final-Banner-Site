/**
 * Blog Card Component
 * Enhanced with modern design, gradients, shadows, and hover effects
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { Clock, ArrowRight, Calendar } from 'lucide-react';
import { OptimizedImage } from './OptimizedImage';
import { TagPill } from './TagPill';
import type { BlogListItem } from '@/lib/blog';

interface BlogCardProps {
  post: BlogListItem;
  featured?: boolean;
}

export function BlogCard({ post, featured = false }: BlogCardProps) {
  const { frontmatter, excerpt, readingTime } = post;
  
  // Handle both 'hero' and 'heroImage' field names
  const heroImageUrl = (frontmatter as any).heroImage || (frontmatter as any).hero || 'https://via.placeholder.com/640x360/18448D/ffffff?text=Blog+Post';
  
  if (featured) {
    return (
      <article className="group relative bg-white rounded-3xl shadow-xl overflow-hidden hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-2 border border-gray-100">
        <div className="grid md:grid-cols-2 gap-0">
          {/* Image Section */}
          <Link to={`/blog/${frontmatter.slug}`} className="block relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-[#18448D]/20 to-[#ff6b35]/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-10" />
            <OptimizedImage
              src={heroImageUrl}
              alt={frontmatter.alt}
              width={800}
              className="w-full h-64 md:h-full object-cover transition-transform duration-700 group-hover:scale-110"
            />
            {/* Featured Badge */}
            <div className="absolute top-4 left-4 z-20">
              <span className="inline-flex items-center px-4 py-2 rounded-full text-sm font-bold bg-gradient-to-r from-[#ff6b35] to-[#f7931e] text-white shadow-lg">
                ⭐ Featured Article
              </span>
            </div>
          </Link>
          
          {/* Content Section */}
          <div className="p-8 md:p-10 flex flex-col justify-center">
            <div className="flex flex-wrap gap-2 mb-4">
              {frontmatter.tags.slice(0, 3).map(tag => (
                <TagPill key={tag} tag={tag} linkTo />
              ))}
            </div>
            
            <Link to={`/blog/${frontmatter.slug}`} className="block group/title">
              <h2 className="text-2xl md:text-3xl font-black text-gray-900 mb-4 leading-tight group-hover/title:text-[#18448D] transition-colors duration-300">
                {frontmatter.title}
              </h2>
            </Link>
            
            <p className="text-gray-600 mb-6 line-clamp-3 text-lg leading-relaxed">{excerpt}</p>
            
            <div className="flex items-center gap-6 text-sm text-gray-500 mb-6">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#18448D]" />
                <time dateTime={frontmatter.publishDate || frontmatter.date}>
                  {new Date(frontmatter.publishDate || frontmatter.date).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </time>
              </div>
              {readingTime && (
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#ff6b35]" />
                  <span>{readingTime}</span>
                </div>
              )}
            </div>
            
            <Link
              to={`/blog/${frontmatter.slug}`}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-[#18448D] to-[#1a5bc4] text-white font-semibold hover:from-[#ff6b35] hover:to-[#f7931e] transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl w-fit group/btn"
            >
              Read Full Article
              <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover/btn:translate-x-1" />
            </Link>
          </div>
        </div>
      </article>
    );
  }
  
  return (
    <article className="group relative bg-white rounded-2xl shadow-lg overflow-hidden hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-3 border border-gray-100/50 flex flex-col h-full">
      {/* Decorative gradient border on hover */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#18448D] via-[#1a5bc4] to-[#ff6b35] opacity-0 group-hover:opacity-100 transition-opacity duration-500 -z-10 blur-sm scale-[1.02]" />
      
      {/* Image Container */}
      <Link to={`/blog/${frontmatter.slug}`} className="block relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-10" />
        <OptimizedImage
          src={heroImageUrl}
          alt={frontmatter.alt}
          width={640}
          className="w-full h-52 object-cover transition-transform duration-700 group-hover:scale-110"
        />
        {/* Reading time badge */}
        {readingTime && (
          <div className="absolute top-4 right-4 z-20">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-white/90 backdrop-blur-sm text-gray-700 shadow-lg">
              <Clock className="w-3.5 h-3.5 text-[#ff6b35]" />
              {readingTime}
            </span>
          </div>
        )}
      </Link>
      
      {/* Content */}
      <div className="p-6 flex flex-col flex-grow bg-gradient-to-b from-white to-gray-50/50">
        {/* Tags */}
        <div className="flex flex-wrap gap-2 mb-4">
          {frontmatter.tags.slice(0, 3).map(tag => (
            <TagPill key={tag} tag={tag} linkTo />
          ))}
        </div>
        
        {/* Title */}
        <Link to={`/blog/${frontmatter.slug}`} className="block group/title">
          <h2 className="text-xl font-bold text-gray-900 mb-3 leading-snug group-hover/title:text-[#18448D] transition-colors duration-300 line-clamp-2">
            {frontmatter.title}
          </h2>
        </Link>
        
        {/* Excerpt */}
        <p className="text-gray-600 mb-4 line-clamp-2 text-sm leading-relaxed flex-grow">{excerpt}</p>
        
        {/* Meta & CTA */}
        <div className="mt-auto pt-4 border-t border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Calendar className="w-4 h-4 text-[#18448D]" />
              <time dateTime={frontmatter.publishDate || frontmatter.date}>
                {new Date(frontmatter.publishDate || frontmatter.date).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </time>
            </div>
            
            <Link
              to={`/blog/${frontmatter.slug}`}
              className="inline-flex items-center gap-1.5 text-[#18448D] font-semibold text-sm hover:text-[#ff6b35] transition-all duration-300 group/link"
            >
              Read More
              <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover/link:translate-x-1" />
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
