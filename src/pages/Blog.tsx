/**
 * Blog Index Page
 * /blog route
 */

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import Layout from '@/components/Layout';
import { BlogList } from '@/components/blog';
import { getAllPosts, getAllTags, paginatePosts } from '@/lib/blog';
import type { BlogListItem } from '@/lib/blog';

const POSTS_PER_PAGE = 12;

export default function Blog() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [posts, setPosts] = useState<BlogListItem[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const currentPage = parseInt(searchParams.get('page') || '1', 10);
  
  useEffect(() => {
    async function loadPosts() {
      try {
        const [allPosts, tags] = await Promise.all([
          getAllPosts(),
          getAllTags(),
        ]);
        
        setPosts(allPosts);
        setAllTags(tags);
      } catch (error) {
        console.error('Error loading blog posts:', error);
      } finally {
        setIsLoading(false);
      }
    }
    
    loadPosts();
  }, []);
  
  const handlePageChange = (page: number) => {
    setSearchParams({ page: page.toString() });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  
  const paginatedData = paginatePosts(posts, currentPage, POSTS_PER_PAGE);
  
  if (isLoading) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#18448D] mx-auto mb-4"></div>
            <p className="text-gray-600">Loading blog posts...</p>
          </div>
        </div>
      </Layout>
    );
  }
  
  return (
    <Layout>
      <Helmet>
        <title>Blog - Banners on the Fly | Custom Banner Printing Tips & Guides</title>
        <meta
          name="description"
          content="Expert tips, guides, and insights on custom banner printing, design, and marketing. Learn how to create effective banners for your business."
        />
        <meta property="og:title" content="Blog - Banners on the Fly" />
        <meta
          property="og:description"
          content="Expert tips, guides, and insights on custom banner printing, design, and marketing."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://bannersonthefly.com/blog" />
        <link rel="canonical" href="https://bannersonthefly.com/blog" />
      </Helmet>
      
      <BlogList
        posts={paginatedData.posts}
        allTags={allTags}
        currentPage={paginatedData.currentPage}
        totalPages={paginatedData.totalPages}
        onPageChange={handlePageChange}
      />
    </Layout>
  );
}
