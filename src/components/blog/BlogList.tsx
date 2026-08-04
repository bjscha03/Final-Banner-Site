import React, { useMemo, useState } from 'react';
import { CheckCircle, Loader2, Search, Send, X } from 'lucide-react';
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

export function BlogList({ posts, allTags, currentPage, totalPages, onPageChange }: BlogListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showAllTags, setShowAllTags] = useState(false);
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const { toast } = useToast();

  const filteredPosts = useMemo(() => posts.filter((post) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = !query || post.frontmatter.title.toLowerCase().includes(query) || post.frontmatter.description.toLowerCase().includes(query) || post.frontmatter.tags.some((tag) => tag.toLowerCase().includes(query));
    const matchesTags = selectedTags.length === 0 || selectedTags.every((selected) => post.frontmatter.tags.some((tag) => tag.toLowerCase() === selected.toLowerCase()));
    return matchesSearch && matchesTags;
  }), [posts, searchQuery, selectedTags]);

  const toggleTag = (tag: string) => setSelectedTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]);
  const clearFilters = () => { setSearchQuery(''); setSelectedTags([]); };
  const featuredPost = !searchQuery && selectedTags.length === 0 ? filteredPosts[0] : null;
  const regularPosts = featuredPost ? filteredPosts.slice(1) : filteredPosts;
  const visibleTags = showAllTags ? allTags : allTags.slice(0, 8);

  const handleNewsletterSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(newsletterEmail.trim())) {
      toast({ title: 'Enter a valid email', description: 'Please check the email address and try again.', variant: 'destructive' });
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch('/.netlify/functions/newsletter-signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: newsletterEmail.trim() }) });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Subscription failed');
      setSubmitStatus('success');
      setNewsletterEmail('');
    } catch (error) {
      setSubmitStatus('error');
      toast({ title: 'Subscription failed', description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="brand-shell py-12 sm:py-16">
      <div className="grid gap-6 border-b border-slate-200 pb-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
        <div>
          <label htmlFor="article-search" className="brand-eyebrow">Search the library</label>
          <div className="relative mt-3 max-w-xl">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input id="article-search" type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search by title, topic, or keyword" className="brand-field pl-12 pr-11" />
            {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-slate-400" aria-label="Clear search"><X className="h-4 w-4" /></button>}
          </div>
        </div>
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 lg:justify-end">
            {visibleTags.map((tag) => <TagPill key={tag} tag={tag} active={selectedTags.includes(tag)} onClick={() => toggleTag(tag)} />)}
            {allTags.length > 8 && <button onClick={() => setShowAllTags(!showAllTags)} className="px-1 text-xs font-bold text-[#A63C00]">{showAllTags ? 'Show fewer' : `+${allTags.length - 8} more`}</button>}
          </div>
        )}
      </div>

      {(searchQuery || selectedTags.length > 0) && <div className="mt-5 flex items-center justify-between gap-4"><p className="text-sm text-slate-500">{filteredPosts.length} matching article{filteredPosts.length === 1 ? '' : 's'}</p><button onClick={clearFilters} className="text-sm font-bold text-[#0B1F3A] underline decoration-[#FF6A00] underline-offset-4">Clear filters</button></div>}

      {featuredPost && <div className="mt-10"><BlogCard post={featuredPost} featured /></div>}

      {regularPosts.length > 0 ? (
        <section className="mt-14" aria-labelledby="latest-articles-heading">
          <div className="flex items-end justify-between gap-4"><div><p className="brand-eyebrow">Print knowledge</p><h2 id="latest-articles-heading" className="mt-2 font-display text-3xl font-bold text-[#0B1F3A]">Latest articles</h2></div><p className="text-sm text-slate-500">{filteredPosts.length} total</p></div>
          <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">{regularPosts.map((post) => <BlogCard key={post.slug} post={post} />)}</div>
        </section>
      ) : (
        <div className="mt-10 border border-slate-200 bg-[#F7F7F7] p-10 text-center"><h3 className="font-display text-xl font-bold text-[#0B1F3A]">No articles found</h3><p className="mt-2 text-slate-600">Try another search or clear the topic filters.</p><button onClick={clearFilters} className="brand-button-secondary mt-6">Clear filters</button></div>
      )}

      {totalPages > 1 && onPageChange && (
        <nav className="mt-12 flex flex-wrap items-center justify-center gap-2" aria-label="Blog pagination">
          <button onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1} className="brand-button-secondary min-h-11 px-4 disabled:opacity-40">Previous</button>
          {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => <button key={page} onClick={() => onPageChange(page)} className={`h-11 w-11 border font-bold ${page === currentPage ? 'border-[#0B1F3A] bg-[#0B1F3A] text-white' : 'border-slate-200 bg-white text-[#0B1F3A]'}`}>{page}</button>)}
          <button onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages} className="brand-button-secondary min-h-11 px-4 disabled:opacity-40">Next</button>
        </nav>
      )}

      <section className="mt-16 border-l-4 border-[#FF6A00] bg-[#0B1F3A] p-7 text-white sm:p-10">
        <div className="grid gap-7 lg:grid-cols-[1fr_auto] lg:items-center">
          <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#FF8A3D]">Occasional print notes</p><h2 className="mt-3 font-display text-2xl font-bold sm:text-3xl">Useful production and design guidance, by email.</h2><p className="mt-3 text-slate-300">Subscribe for new guides and relevant offers. No fabricated trend reports or daily noise.</p></div>
          {submitStatus === 'success' ? <div className="flex items-center gap-2 font-bold"><CheckCircle className="h-5 w-5 text-[#FF8A3D]" />Subscribed</div> : (
            <form onSubmit={handleNewsletterSubmit} className="flex min-w-0 flex-col gap-3 sm:flex-row">
              <input type="email" value={newsletterEmail} onChange={(event) => setNewsletterEmail(event.target.value)} placeholder="Email address" className="min-h-12 w-full min-w-0 rounded-md border border-white/25 bg-white px-4 text-[#0B1F3A] sm:w-auto sm:min-w-[260px]" disabled={isSubmitting} />
              <button type="submit" className="brand-button-primary gap-2" disabled={isSubmitting}>{isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}Subscribe</button>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
