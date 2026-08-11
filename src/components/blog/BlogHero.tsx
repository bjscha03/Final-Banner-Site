import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Clock3 } from 'lucide-react';
import HeroDeliveryStatus from '@/components/delivery/HeroDeliveryStatus';
import type { BlogListItem } from '@/lib/blog';
import { OptimizedImage } from './OptimizedImage';

interface BlogHeroProps {
  post: BlogListItem;
}

const guideTopics = [
  { label: 'Materials', to: '/blog/tags/materials' },
  { label: 'Artwork', to: '/blog/tags/artwork' },
  { label: 'Installation', to: '/blog/tags/installation' },
  { label: 'Marketing', to: '/blog/tags/marketing' },
];

export function BlogHero({ post }: BlogHeroProps) {
  const { frontmatter, readingTime } = post;
  const articleUrl = `/blog/${frontmatter.slug}`;
  const heroImageUrl = frontmatter.heroImage || frontmatter.hero || '/images/og-default.png';
  const category = frontmatter.tags[0] || 'Print guide';

  return (
    <section
      data-blog-hero
      aria-labelledby="blog-field-guide-title"
      className="border-b border-[#F45B08] bg-[#FBF8F2]"
    >
      <div className="mx-auto grid w-full max-w-[1740px] lg:grid-cols-[0.76fr_1.24fr] lg:items-center">
        <div className="px-5 py-10 sm:px-8 sm:py-14 lg:px-10 lg:py-16 xl:px-14 2xl:px-16">
          <div className="flex items-center gap-3 text-[#C94E00]">
            <BookOpen className="h-8 w-8 flex-none stroke-[1.8] sm:h-9 sm:w-9" aria-hidden="true" />
            <p className="font-mono text-[11px] font-black uppercase tracking-[0.16em] sm:text-xs">
              The Banners On The Fly field guide
            </p>
          </div>

          <h1
            id="blog-field-guide-title"
            className="homepage-condensed mt-5 text-[4.15rem] font-black uppercase leading-[0.86] tracking-[-0.012em] text-[#061A31] [--homepage-mobile-size:4.15rem] sm:text-[5.35rem] lg:text-[5.45rem] xl:text-[6.15rem] 2xl:text-[6.75rem]"
          >
            Print smarter.
            <br />
            Get noticed.
          </h1>

          <p className="mt-6 max-w-[590px] text-base leading-7 text-[#344860] sm:text-lg sm:leading-8">
            Practical, straight-to-the-point guides for choosing materials, preparing artwork,
            installing banners, and getting more from every sign.
          </p>

          <div className="mt-8 flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:gap-8">
            <a
              href="#article-library"
              className="inline-flex min-h-[52px] items-center justify-center gap-3 bg-[#061A31] px-7 py-4 font-mono text-xs font-black uppercase tracking-[0.12em] text-white transition-colors hover:bg-[#123251] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F45B08] focus-visible:ring-offset-2"
            >
              Explore all guides
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </a>
            <Link
              to="/design"
              className="group inline-flex min-h-11 items-center gap-3 border-b-2 border-[#F45B08] py-2 font-mono text-xs font-black uppercase tracking-[0.12em] text-[#C94E00] transition-colors hover:text-[#9E3E00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F45B08] focus-visible:ring-offset-2"
            >
              Start designing
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" aria-hidden="true" />
            </Link>
          </div>

          <nav
            aria-label="Browse field guide topics"
            className="mt-10 flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-[#D7D8D4] pt-6 sm:gap-x-5"
          >
            {guideTopics.map((topic, index) => (
              <React.Fragment key={topic.label}>
                <Link
                  to={topic.to}
                  className="font-mono text-[10px] font-black uppercase tracking-[0.12em] text-[#102B49] transition-colors hover:text-[#C94E00] sm:text-[11px]"
                >
                  {topic.label}
                </Link>
                {index < guideTopics.length - 1 && (
                  <span className="h-4 w-px bg-[#F45B08]" aria-hidden="true" />
                )}
              </React.Fragment>
            ))}
          </nav>
        </div>

        <article className="min-w-0 self-stretch border-t border-[#D7D8D4] lg:border-l lg:border-t-0">
          <div className="relative h-full min-h-[520px] sm:min-h-[640px] lg:min-h-[650px]">
            <Link
              to={articleUrl}
              aria-label={`Read featured guide: ${frontmatter.title}`}
              className="absolute inset-x-0 top-0 block h-[61%] overflow-hidden bg-slate-200 sm:h-[65%]"
            >
              <OptimizedImage
                src={heroImageUrl}
                alt={frontmatter.alt || frontmatter.title}
                width={1200}
                height={760}
                priority
                className="h-full w-full"
              />
            </Link>

            <div className="pointer-events-none absolute left-0 top-0 z-10 bg-[#E85C16] px-5 py-3 font-mono text-[11px] font-black uppercase tracking-[0.12em] text-white sm:px-6 sm:text-xs">
              Featured guide
            </div>

            <div className="pointer-events-none absolute right-0 top-0 z-10 flex bg-[#061A31] px-4 py-3 font-mono text-[10px] font-black uppercase tracking-[0.13em] text-white xl:bottom-[35%] xl:w-12 xl:items-start xl:justify-center xl:px-0 xl:py-5 xl:[writing-mode:vertical-rl]">
              01 // Featured
            </div>

            <div className="absolute inset-x-0 bottom-0 flex h-[39%] min-h-[230px] flex-col justify-between bg-[#061A31] px-6 py-6 text-white sm:h-[35%] sm:px-8 sm:py-7 lg:px-9 xl:px-10">
              <div className="min-w-0">
                <p className="font-mono text-[11px] font-black uppercase tracking-[0.14em] text-[#F26A21] sm:text-xs">
                  {category}
                </p>
                <Link to={articleUrl} className="group inline-block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F45B08]">
                  <h2 className="homepage-condensed mt-3 line-clamp-2 text-[2.1rem] font-black uppercase leading-[0.95] tracking-[-0.01em] text-white transition-colors group-hover:text-[#FFD1B6] sm:text-[2.65rem] lg:text-[2.85rem] xl:text-[3.15rem]">
                    {frontmatter.title}
                  </h2>
                </Link>
              </div>

              <div className="mt-5 flex items-center justify-between gap-5 border-t-2 border-[#F45B08] pt-4">
                {readingTime && (
                  <span className="flex items-center gap-2 font-mono text-[10px] font-black uppercase tracking-[0.12em] text-white sm:text-xs">
                    <Clock3 className="h-5 w-5 flex-none" aria-hidden="true" />
                    {readingTime}
                  </span>
                )}
                <Link
                  to={articleUrl}
                  className="ml-auto inline-flex items-center gap-3 font-mono text-[10px] font-black uppercase tracking-[0.12em] text-white transition-colors hover:text-[#F26A21] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F45B08] sm:text-xs"
                >
                  Read the guide
                  <ArrowRight className="h-5 w-5" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>
        </article>
      </div>

      <HeroDeliveryStatus variant="editorial" />
    </section>
  );
}
