import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Calendar, Clock } from 'lucide-react';
import { OptimizedImage } from './OptimizedImage';
import { TagPill } from './TagPill';
import type { BlogListItem } from '@/lib/blog';

interface BlogCardProps {
  post: BlogListItem;
  featured?: boolean;
}

export function BlogCard({ post, featured = false }: BlogCardProps) {
  const { frontmatter, excerpt, readingTime } = post;
  const heroImageUrl = (frontmatter as any).heroImage || (frontmatter as any).hero || '/images/og-default.png';
  const articleUrl = `/blog/${frontmatter.slug}`;
  const date = new Date(frontmatter.publishDate || frontmatter.date).toLocaleDateString('en-US', {
    year: 'numeric', month: featured ? 'long' : 'short', day: 'numeric',
  });

  if (featured) {
    return (
      <article className="grid overflow-hidden border border-slate-200 bg-white lg:grid-cols-[1.05fr_0.95fr]">
        <Link to={articleUrl} className="block min-h-[300px] overflow-hidden bg-slate-100">
          <OptimizedImage src={heroImageUrl} alt={frontmatter.alt} width={900} className="h-full min-h-[300px] w-full object-cover" />
        </Link>
        <div className="flex flex-col justify-center p-7 sm:p-9 lg:p-11">
          <div className="flex flex-wrap gap-3">{frontmatter.tags.slice(0, 3).map((tag) => <TagPill key={tag} tag={tag} linkTo />)}</div>
          <Link to={articleUrl}><h2 className="mt-4 font-display text-3xl font-bold leading-tight tracking-[-0.03em] text-[#0B1F3A] hover:text-[#A63C00]">{frontmatter.title}</h2></Link>
          <p className="mt-4 line-clamp-3 text-lg leading-7 text-slate-600">{excerpt}</p>
          <div className="mt-6 flex flex-wrap gap-5 text-sm text-slate-500">
            <span className="flex items-center gap-2"><Calendar className="h-4 w-4 text-[#FF6A00]" />{date}</span>
            {readingTime && <span className="flex items-center gap-2"><Clock className="h-4 w-4 text-[#FF6A00]" />{readingTime}</span>}
          </div>
          <Link to={articleUrl} className="mt-7 inline-flex items-center gap-2 font-bold text-[#0B1F3A] underline decoration-[#FF6A00] decoration-2 underline-offset-4">Read article <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </article>
    );
  }

  return (
    <article className="flex h-full flex-col overflow-hidden border border-slate-200 bg-white transition-colors hover:border-[#0B1F3A]">
      <Link to={articleUrl} className="block overflow-hidden bg-slate-100">
        <OptimizedImage src={heroImageUrl} alt={frontmatter.alt} width={640} className="aspect-[16/10] w-full object-cover" />
      </Link>
      <div className="flex flex-1 flex-col p-6">
        <div className="flex flex-wrap gap-3">{frontmatter.tags.slice(0, 2).map((tag) => <TagPill key={tag} tag={tag} linkTo />)}</div>
        <Link to={articleUrl}><h2 className="mt-4 line-clamp-2 font-display text-xl font-bold leading-snug text-[#0B1F3A] hover:text-[#A63C00]">{frontmatter.title}</h2></Link>
        <p className="mt-3 line-clamp-3 flex-1 text-sm leading-6 text-slate-600">{excerpt}</p>
        <div className="mt-5 flex items-center justify-between gap-4 border-t border-slate-200 pt-4 text-xs text-slate-500">
          <time dateTime={frontmatter.publishDate || frontmatter.date}>{date}</time>
          {readingTime && <span>{readingTime}</span>}
        </div>
      </div>
    </article>
  );
}
