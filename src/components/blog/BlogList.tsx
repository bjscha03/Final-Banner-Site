/**
 * Blog List Component with Search and Filtering
 */

import React, { useState, useMemo } from 'react';
import { BlogCard } from './BlogCard';
import { TagPill } from './TagPill';
import type { BlogListItem } from '@/lib/blog';

interface BlogListProps {
  posts: BlogListItem[];
  allTags: string[];
  currentPage: number;
  totalPages: number;
  onPageChange?: (page: number) => void;
}

export function BlogList({
  posts,
  allTags,
  currentPage,
  totalPages,
  onPageChange,
}: BlogListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  
  const filteredPosts = useMemo(() => {
    return posts.filter(post => {
      const matchesSearch = searchQuery === '' || 
        post.frontmatter.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        post.frontmatter.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        post.frontmatter.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
      
      const matchesTags = selectedTags.length === 0 ||
        selectedTags.every(selectedTag =>
          post.frontmatter.tags.some(tag => tag.toLowerCase() === selectedTag.toLowerCase())
        );
      
      return matchesSearch && matchesTags;
    });
  }, [posts, searchQuery, selectedTags]);
  
  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag)
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };
  
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Search and Filters */}
      <div className="mb-8">
        <div className="max-w-2xl mx-auto mb-6">
          <input
            type="text"
            placeholder="Search articles..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#18448D] focus:border-transparent"
          />
        </div>
        
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-2 justify-center">
            {allTags.map(tag => (
              <TagPill
                key={tag}
                tag={tag}
                active={selectedTags.includes(tag)}
                onClick={() => toggleTag(tag)}
              />
            ))}
          </div>
        )}
      </div>
      
      {/* Posts Grid */}
      {filteredPosts.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
          {filteredPosts.map(post => (
            <BlogCard key={post.slug} post={post} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-xl text-gray-600">No articles found matching your criteria.</p>
          <button
            onClick={() => {
              setSearchQuery('');
              setSelectedTags([]);
            }}
            className="mt-4 text-[#18448D] font-semibold hover:text-[#ff6b35] transition-colors"
          >
            Clear filters
          </button>
        </div>
      )}
      
      {/* Pagination */}
      {totalPages > 1 && onPageChange && (
        <div className="flex justify-center items-center gap-2">
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
          >
            Previous
          </button>
          
          <div className="flex gap-2">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
              <button
                key={page}
                onClick={() => onPageChange(page)}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  page === currentPage
                    ? 'bg-[#18448D] text-white'
                    : 'border border-gray-300 hover:bg-gray-50'
                }`}
              >
                {page}
              </button>
            ))}
          </div>
          
          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
