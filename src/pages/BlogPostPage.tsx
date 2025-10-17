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
import type { BlogPost as BlogPostType, BlogListItem } from '@/lib/blog';

export default function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const [post, setPost] = useState<BlogPostType | null>(null);
  const [relatedPosts, setRelatedPosts] = useState<BlogListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  
  useEffect(() => {
    async function loadPost() {
      if (!slug) {
        setNotFound(true);
        setIsLoading(false);
        return;
      }
      
      try {
        const postData = await getPostBySlug(slug);
        
        if (!postData) {
          setNotFound(true);
          setIsLoading(false);
          return;
        }
        
        setPost(postData);
        
        // Load related posts
        const related = await getRelatedPosts(
          postData.slug,
          postData.frontmatter.tags,
          2
        );
        setRelatedPosts(related);
      } catch (error) {
        console.error('Error loading blog post:', error);
        setNotFound(true);
      } finally {
        setIsLoading(false);
      }
    }
    
    loadPost();
  }, [slug]);
  
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
  
  if (notFound || !post) {
    return <Navigate to="/blog" replace />;
  }
  
  const { frontmatter } = post;
  const canonicalUrl = frontmatter.canonical || `https://bannersonthefly.com/blog/${frontmatter.slug}`;
  
  // Handle both 'hero' and 'heroImage' field names, with fallback to placeholder
  const heroImageUrl = (frontmatter as any).heroImage || frontmatter.hero || 'https://via.placeholder.com/1200x600/18448D/ffffff?text=Blog+Post+Image';
  const heroImage = heroImageUrl.includes('cloudinary.com') || heroImageUrl.includes('placeholder.com')
    ? heroImageUrl
    : `https://bannersonthefly.com${heroImageUrl}`;
  
  // JSON-LD Schema
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: frontmatter.title,
    description: frontmatter.description,
    image: heroImage,
    datePublished: frontmatter.date,
    dateModified: frontmatter.updated || frontmatter.date,
    author: {
      '@type': 'Organization',
      name: frontmatter.author,
    },
    publisher: {
      '@type': 'Organization',
      name: 'Banners on the Fly',
      logo: {
        '@type': 'ImageObject',
        url: 'https://bannersonthefly.com/logo.png',
      },
    },
  };
  
  return (
    <Layout>
      <Helmet>
        <title>{frontmatter.title} - Banners on the Fly Blog</title>
        <meta name="description" content={frontmatter.description} />
        
        {/* Open Graph */}
        <meta property="og:title" content={frontmatter.title} />
        <meta property="og:description" content={frontmatter.description} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:image" content={heroImage} />
        <meta property="article:published_time" content={frontmatter.date} />
        {frontmatter.updated && (
          <meta property="article:modified_time" content={frontmatter.updated} />
        )}
        {frontmatter.tags.map(tag => (
          <meta key={tag} property="article:tag" content={tag} />
        ))}
        
        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={frontmatter.title} />
        <meta name="twitter:description" content={frontmatter.description} />
        <meta name="twitter:image" content={heroImage} />
        
        {/* Canonical */}
        <link rel="canonical" href={canonicalUrl} />
        
        {/* Noindex if specified */}
        {frontmatter.noindex && <meta name="robots" content="noindex,nofollow" />}
        
        {/* JSON-LD Schema */}
        <script type="application/ld+json">{JSON.stringify(schema)}</script>
      </Helmet>
      
      <BlogPost post={post} relatedPosts={relatedPosts} />
    </Layout>
  );
}
