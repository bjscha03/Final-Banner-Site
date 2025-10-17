/**
 * Blog Tag Archive Page
 * /blog/tags/[tag] route
 */

import React, { useEffect, useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import Layout from '@/components/Layout';
import { BlogList } from '@/components/blog';
import { getPostsByTag, getAllTags } from '@/lib/blog';
import type { BlogListItem } from '@/lib/blog';

export default function BlogTagPage() {
  const { tag } = useParams<{ tag: string }>();
  const [posts, setPosts] = useState<BlogListItem[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  
  useEffect(() => {
    async function loadPosts() {
      if (!tag) {
        setNotFound(true);
        setIsLoading(false);
        return;
      }
      
      try {
        const decodedTag = decodeURIComponent(tag);
        const [tagPosts, tags] = await Promise.all([
          getPostsByTag(decodedTag),
          getAllTags(),
        ]);
        
        if (tagPosts.length === 0) {
          setNotFound(true);
        } else {
          setPosts(tagPosts);
          setAllTags(tags);
        }
      } catch (error) {
        console.error('Error loading tag posts:', error);
        setNotFound(true);
      } finally {
        setIsLoading(false);
      }
    }
    
    loadPosts();
  }, [tag]);
  
  if (isLoading) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#18448D] mx-auto mb-4"></div>
            <p className="text-gray-600">Loading articles...</p>
          </div>
        </div>
      </Layout>
    );
  }
  
  if (notFound || !tag) {
    return <Navigate to="/blog" replace />;
  }
  
  const decodedTag = decodeURIComponent(tag);
  const capitalizedTag = decodedTag.charAt(0).toUpperCase() + decodedTag.slice(1);
  
  return (
    <Layout>
      <Helmet>
        <title>{capitalizedTag} Articles - Banners on the Fly Blog</title>
        <meta
          name="description"
          content={`Browse all articles tagged with "${capitalizedTag}" on the Banners on the Fly blog.`}
        />
        <meta property="og:title" content={`${capitalizedTag} Articles - Banners on the Fly Blog`} />
        <meta
          property="og:description"
          content={`Browse all articles tagged with "${capitalizedTag}".`}
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`https://bannersonthefly.com/blog/tags/${tag}`} />
        <link rel="canonical" href={`https://bannersonthefly.com/blog/tags/${tag}`} />
      </Helmet>
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl lg:text-5xl font-bold text-gray-900 mb-4">
            Articles tagged: <span className="text-[#18448D]">{capitalizedTag}</span>
          </h1>
          <p className="text-xl text-gray-600">
            {posts.length} {posts.length === 1 ? 'article' : 'articles'} found
          </p>
        </div>
        
        <BlogList
          posts={posts}
          allTags={allTags}
          currentPage={1}
          totalPages={1}
        />
      </div>
    </Layout>
  );
}
