/**
 * Blog Post Page
 * /blog/[slug] route
 */

import React, { useEffect, useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import Layout from '@/components/Layout';
import { BlogPost } from '@/components/blog';
import { getPostBySlug, getRelatedPosts } from '@/lib/blog';
import { getPrerenderedPost } from '@/lib/blog/prerenderedPosts';
import type { BlogPost as BlogPostType, BlogListItem } from '@/lib/blog';

export default function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();
  // Reset article state when navigating between posts within the SPA.
  return <BlogPostContent key={slug} slug={slug} />;
}

function BlogPostContent({ slug }: { slug: string | undefined }) {
  const initialPost = getPrerenderedPost(slug);
  const [post, setPost] = useState<BlogPostType | null>(initialPost);
  const [relatedPosts, setRelatedPosts] = useState<BlogListItem[]>([]);
  const [isLoading, setIsLoading] = useState(!initialPost);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadPost() {
      if (!slug) {
        setNotFound(true);
        setIsLoading(false);
        return;
      }

      try {
        const postData = getPrerenderedPost(slug) || await getPostBySlug(slug);
        if (cancelled) return;
        if (!postData) {
          setNotFound(true);
          setIsLoading(false);
          return;
        }
        setPost(postData);
        const related = await getRelatedPosts(postData.slug, postData.frontmatter.tags, 2);
        if (!cancelled) setRelatedPosts(related);
      } catch (error) {
        console.error('Error loading blog post:', error);
        if (!cancelled && !initialPost) setNotFound(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadPost();
    return () => { cancelled = true; };
  }, [slug, initialPost]);

  if (isLoading) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#18448D] mx-auto mb-4"></div>
            <p className="text-gray-600">Loading article...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (notFound || !post) return <Navigate to="/blog" replace />;

  const { frontmatter } = post;
  const description = frontmatter.excerpt || frontmatter.description || post.excerpt || 'Read this article on Banners on the Fly blog';
  const publishDate = frontmatter.publishDate || frontmatter.date || new Date().toISOString();
  const heroImageUrl = frontmatter.heroImage || frontmatter.hero || 'https://res.cloudinary.com/dtrxl120u/image/upload/v1/blog/default-banner.jpg';
  const canonicalUrl = frontmatter.canonical || `https://bannersonthefly.com/blog/${frontmatter.slug}`;
  const heroImage = heroImageUrl.startsWith('http') ? heroImageUrl : `https://bannersonthefly.com${heroImageUrl}`;
  const seoTitle = (frontmatter as typeof frontmatter & { seoTitle?: string }).seoTitle
    || `${frontmatter.title} - Banners on the Fly Blog`;

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: frontmatter.title,
    description,
    image: heroImage,
    datePublished: publishDate,
    dateModified: frontmatter.updated || publishDate,
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl },
    author: { '@type': 'Organization', name: frontmatter.author },
    publisher: {
      '@type': 'Organization',
      name: 'Banners on the Fly',
      logo: { '@type': 'ImageObject', url: 'https://bannersonthefly.com/images/logo-social.svg' },
    },
  };

  return (
    <Layout>
      <Helmet>
        <title>{seoTitle}</title>
        <meta name="description" content={description} />
        <meta property="og:title" content={frontmatter.title} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:image" content={heroImage} />
        <meta property="og:image:secure_url" content={heroImage} />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content={frontmatter.alt || frontmatter.title} />
        <meta property="og:site_name" content="Banners on the Fly" />
        <meta property="article:published_time" content={publishDate} />
        {frontmatter.updated && <meta property="article:modified_time" content={frontmatter.updated} />}
        {frontmatter.tags.map(tag => <meta key={tag} property="article:tag" content={tag} />)}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={frontmatter.title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={heroImage} />
        <meta name="twitter:image:alt" content={frontmatter.alt || frontmatter.title} />
        <link rel="canonical" href={canonicalUrl} />
        {frontmatter.noindex && <meta name="robots" content="noindex,nofollow" />}
        <script type="application/ld+json">{JSON.stringify(schema)}</script>
      </Helmet>
      <BlogPost post={post} relatedPosts={relatedPosts} />
    </Layout>
  );
}
