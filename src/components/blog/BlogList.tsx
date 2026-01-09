/**
 * Blog List Component with Search, Filtering, and Enhanced Design
 */

import React, { useState, useMemo } from 'react';
import { Search, Filter, Sparkles, BookOpen, TrendingUp, X, Send, CheckCircle, Loader2 } from 'lucide-react';
import { BlogCard } from './BlogCard';
import { TagPill } from './TagPill';
import { useToast } from '@/components/ui/use-toast';
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
  const [showAllTags, setShowAllTags] = useState(false);
  
  // Newsletter state
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const { toast } = useToast();
  
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
  
  const clearFilters = () => {
    setSearchQuery('');
    setSelectedTags([]);
  };
  
  // Newsletter submit handler
  const handleNewsletterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newsletterEmail.trim()) {
      toast({
        title: "Email Required",
        description: "Please enter your email address.",
        variant: "destructive",
      });
      return;
    }
    
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newsletterEmail.trim())) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }
    
    setIsSubmitting(true);
    setSubmitStatus('idle');
    
    try {
      const response = await fetch('/.netlify/functions/newsletter-signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: newsletterEmail.trim() }),
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        setSubmitStatus('success');
        setNewsletterEmail('');
        toast({
          title: "You're subscribed! 🎉",
          description: data.message || "Thanks for subscribing! Check your inbox for confirmation.",
          duration: 5000,
        });
      } else {
        setSubmitStatus('error');
        toast({
          title: "Subscription Failed",
          description: data.error || "Failed to subscribe. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Newsletter signup error:', error);
      setSubmitStatus('error');
      toast({
        title: "Network Error",
        description: "Failed to connect. Please check your internet connection and try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
      
      // Reset status after 3 seconds
      setTimeout(() => {
        setSubmitStatus('idle');
      }, 3000);
    }
  };
  
  // Featured post is the first post when no filters are applied
  const featuredPost = searchQuery === '' && selectedTags.length === 0 && filteredPosts.length > 0 ? filteredPosts[0] : null;
  const regularPosts = featuredPost ? filteredPosts.slice(1) : filteredPosts;
  
  // Limit visible tags
  const visibleTags = showAllTags ? allTags : allTags.slice(0, 8);
  const hasMoreTags = allTags.length > 8;
  
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Search and Filters Section */}
      <div className="mb-12">
        {/* Search Bar */}
        <div className="max-w-2xl mx-auto mb-8">
          <div className="relative group">
            <div className="absolute inset-0 bg-gradient-to-r from-[#18448D] to-[#ff6b35] rounded-2xl blur-md opacity-20 group-hover:opacity-30 transition-opacity duration-300" />
            <div className="relative flex items-center">
              <Search className="absolute left-5 w-5 h-5 text-gray-400 group-focus-within:text-[#18448D] transition-colors" />
              <input
                type="text"
                placeholder="Search articles by title, topic, or keyword..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-14 pr-12 py-4 border-2 border-gray-200 rounded-2xl focus:ring-4 focus:ring-[#18448D]/20 focus:border-[#18448D] transition-all duration-300 text-gray-800 placeholder-gray-400 bg-white shadow-lg"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-5 p-1 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
        </div>
        
        {/* Tags Filter */}
        {allTags.length > 0 && (
          <div className="text-center">
            <div className="inline-flex items-center gap-2 mb-4 text-sm font-medium text-gray-600">
              <Filter className="w-4 h-4 text-[#18448D]" />
              <span>Filter by topic:</span>
            </div>
            <div className="flex flex-wrap gap-2 justify-center mb-4">
              {visibleTags.map(tag => (
                <TagPill
                  key={tag}
                  tag={tag}
                  active={selectedTags.includes(tag)}
                  onClick={() => toggleTag(tag)}
                />
              ))}
            </div>
            {hasMoreTags && (
              <button
                onClick={() => setShowAllTags(!showAllTags)}
                className="text-sm font-medium text-[#18448D] hover:text-[#ff6b35] transition-colors"
              >
                {showAllTags ? 'Show less' : `+ ${allTags.length - 8} more topics`}
              </button>
            )}
          </div>
        )}
        
        {/* Active Filters */}
        {(searchQuery || selectedTags.length > 0) && (
          <div className="flex items-center justify-center gap-3 mt-6">
            <span className="text-sm text-gray-500">Active filters:</span>
            {searchQuery && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-[#18448D]/10 text-[#18448D]">
                "{searchQuery}"
                <button onClick={() => setSearchQuery('')} className="hover:text-[#ff6b35]">
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            )}
            {selectedTags.map(tag => (
              <span key={tag} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-[#18448D] text-white">
                {tag}
                <button onClick={() => toggleTag(tag)} className="hover:text-[#ff6b35]">
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
            <button
              onClick={clearFilters}
              className="text-sm font-medium text-gray-500 hover:text-[#ff6b35] transition-colors underline"
            >
              Clear all
            </button>
          </div>
        )}
      </div>
      
      {/* Featured Post Section */}
      {featuredPost && (
        <div className="mb-16">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-[#ff6b35] to-[#f7931e] text-white font-semibold text-sm shadow-lg">
              <Sparkles className="w-4 h-4" />
              <span>Featured Article</span>
            </div>
            <div className="flex-grow h-px bg-gradient-to-r from-[#ff6b35]/30 to-transparent" />
          </div>
          <BlogCard post={featuredPost} featured />
        </div>
      )}
      
      {/* Latest Articles Header */}
      {regularPosts.length > 0 && (
        <div className="flex items-center gap-3 mb-8">
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#18448D]/10 text-[#18448D] font-semibold text-sm">
            <BookOpen className="w-4 h-4" />
            <span>Latest Articles</span>
          </div>
          <div className="flex-grow h-px bg-gradient-to-r from-[#18448D]/30 to-transparent" />
          <span className="text-sm text-gray-500">
            {filteredPosts.length} article{filteredPosts.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}
      
      {/* Posts Grid */}
      {regularPosts.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
          {regularPosts.map(post => (
            <BlogCard key={post.slug} post={post} />
          ))}
        </div>
      ) : (
        <div className="text-center py-16 bg-gradient-to-br from-gray-50 to-white rounded-3xl border border-gray-100">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-[#18448D]/10 flex items-center justify-center">
            <Search className="w-8 h-8 text-[#18448D]" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">No articles found</h3>
          <p className="text-gray-600 mb-6 max-w-md mx-auto">
            We couldn't find any articles matching your criteria. Try adjusting your search or filters.
          </p>
          <button
            onClick={clearFilters}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-[#18448D] to-[#1a5bc4] text-white font-semibold hover:from-[#ff6b35] hover:to-[#f7931e] transition-all duration-300 transform hover:scale-105 shadow-lg"
          >
            Clear all filters
          </button>
        </div>
      )}
      
      {/* Pagination */}
      {totalPages > 1 && onPageChange && (
        <div className="flex justify-center items-center gap-2 mt-12">
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="px-5 py-3 border-2 border-gray-200 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:border-[#18448D] hover:text-[#18448D] hover:bg-[#18448D]/5 transition-all duration-300 font-medium"
          >
            ← Previous
          </button>
          
          <div className="flex gap-2">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
              <button
                key={page}
                onClick={() => onPageChange(page)}
                className={`w-12 h-12 rounded-xl font-semibold transition-all duration-300 ${
                  page === currentPage
                    ? 'bg-gradient-to-r from-[#18448D] to-[#1a5bc4] text-white shadow-lg transform scale-110'
                    : 'border-2 border-gray-200 hover:border-[#18448D] hover:text-[#18448D] hover:bg-[#18448D]/5'
                }`}
              >
                {page}
              </button>
            ))}
          </div>
          
          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="px-5 py-3 border-2 border-gray-200 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:border-[#18448D] hover:text-[#18448D] hover:bg-[#18448D]/5 transition-all duration-300 font-medium"
          >
            Next →
          </button>
        </div>
      )}
      
      {/* Newsletter CTA */}
      <div className="mt-20 relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#18448D] via-[#1a4d9f] to-[#1556b1] p-10 md:p-14 text-center shadow-2xl">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }} />
        </div>
        
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/20 text-white font-medium text-sm mb-6">
            <TrendingUp className="w-4 h-4" />
            <span>Stay Updated</span>
          </div>
          <h3 className="text-2xl md:text-3xl font-black text-white mb-4">
            Get the Latest Banner Tips & Trends
          </h3>
          <p className="text-blue-100 text-lg mb-8 max-w-xl mx-auto">
            Join our newsletter for expert advice on banner design, marketing strategies, and exclusive offers.
          </p>
          
          {submitStatus === 'success' ? (
            <div className="flex items-center justify-center gap-3 text-white">
              <CheckCircle className="w-6 h-6 text-green-400" />
              <span className="text-lg font-semibold">Thanks for subscribing! Check your inbox.</span>
            </div>
          ) : (
            <form onSubmit={handleNewsletterSubmit} className="flex flex-col sm:flex-row gap-4 justify-center max-w-lg mx-auto">
              <input
                type="email"
                placeholder="Enter your email"
                value={newsletterEmail}
                onChange={(e) => setNewsletterEmail(e.target.value)}
                disabled={isSubmitting}
                className="flex-grow px-6 py-4 rounded-xl border-2 border-white/30 bg-white/10 text-white placeholder-white/60 focus:border-white focus:bg-white/20 transition-all duration-300 disabled:opacity-50"
              />
              <button 
                type="submit"
                disabled={isSubmitting}
                className="px-8 py-4 rounded-xl bg-gradient-to-r from-[#ff6b35] to-[#f7931e] text-white font-bold hover:from-[#ff7b45] hover:to-[#ffa32e] transition-all duration-300 transform hover:scale-105 shadow-lg disabled:opacity-50 disabled:transform-none inline-flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Subscribing...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5" />
                    <span>Subscribe</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
