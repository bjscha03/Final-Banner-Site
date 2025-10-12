/**
 * My AI Images Page
 * 
 * Displays all saved AI-generated images for the authenticated user
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Trash2, Download, Image as ImageIcon, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';

interface SavedImage {
  id: string;
  image_url: string;
  prompt: string | null;
  aspect: string | null;
  tier: string;
  generation_id: string | null;
  created_at: string;
  updated_at: string;
}

export default function MyAIImages() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [images, setImages] = useState<SavedImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      navigate('/sign-in?next=/my-ai-images');
      return;
    }
    
    fetchImages();
  }, [user, navigate]);

  const fetchImages = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const response = await fetch(
        `/.netlify/functions/get-saved-ai-images?userId=${encodeURIComponent(user.id)}`
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      setImages(data.images || []);
    } catch (error: any) {
      console.error('[MyAIImages] Error fetching images:', error);
      toast({
        title: 'Error Loading Images',
        description: error.message || 'Failed to load saved images',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (imageId: string) => {
    if (!user) return;
    
    if (!confirm('Are you sure you want to delete this saved image?')) {
      return;
    }

    try {
      setDeleting(imageId);
      const response = await fetch('/.netlify/functions/delete-saved-ai-image', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, imageId }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      toast({
        title: 'Image Deleted',
        description: 'The saved image has been removed.',
      });

      setImages(prev => prev.filter(img => img.id !== imageId));
    } catch (error: any) {
      console.error('[MyAIImages] Error deleting image:', error);
      toast({
        title: 'Delete Failed',
        description: error.message || 'Failed to delete image',
        variant: 'destructive',
      });
    } finally {
      setDeleting(null);
    }
  };

  const handleDownload = async (imageUrl: string, imageId: string) => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ai-banner-${imageId}.png`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: 'Download Started',
        description: 'Your image is being downloaded.',
      });
    } catch (error) {
      console.error('[MyAIImages] Error downloading image:', error);
      toast({
        title: 'Download Failed',
        description: 'Failed to download image',
        variant: 'destructive',
      });
    }
  };

  const handleUseInDesign = (imageUrl: string) => {
    localStorage.setItem('pending_ai_image', imageUrl);
    navigate('/design');
    
    toast({
      title: 'Redirecting to Design',
      description: 'Your saved image will be loaded in the design editor.',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading your saved images...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Sparkles className="w-8 h-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900">My AI Images</h1>
          </div>
          <p className="text-gray-600">
            View and manage your saved AI-generated banner images
          </p>
        </div>

        {images.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <ImageIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              No Saved Images Yet
            </h3>
            <p className="text-gray-600 mb-6">
              Generate AI banners and save your favorites to access them later.
            </p>
            <Button
              onClick={() => navigate('/design')}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Generate AI Banner
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {images.map((image) => (
              <div
                key={image.id}
                className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
              >
                <div className="aspect-video bg-gray-100 relative group">
                  <img
                    src={image.image_url}
                    alt={image.prompt || 'AI Generated Image'}
                    className="w-full h-full object-cover"
                  />
                  
                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <Button
                      onClick={() => handleUseInDesign(image.image_url)}
                      className="bg-white text-gray-900 hover:bg-gray-100"
                    >
                      Use in Design
                    </Button>
                  </div>
                </div>

                <div className="p-4">
                  {image.prompt && (
                    <p className="text-sm text-gray-700 mb-3 line-clamp-2">
                      {image.prompt}
                    </p>
                  )}
                  
                  <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
                    {image.tier && (
                      <span className={`px-2 py-1 rounded-full ${
                        image.tier === 'premium' 
                          ? 'bg-purple-100 text-purple-700' 
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {image.tier === 'premium' ? '👑 Premium' : '⚡ Standard'}
                      </span>
                    )}
                    {image.aspect && (
                      <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded-full">
                        {image.aspect}
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-gray-400 mb-3">
                    Saved {new Date(image.created_at).toLocaleDateString()}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleDownload(image.image_url, image.id)}
                      variant="outline"
                      size="sm"
                      className="flex-1"
                    >
                      <Download className="w-4 h-4 mr-1" />
                      Download
                    </Button>
                    <Button
                      onClick={() => handleDelete(image.id)}
                      variant="outline"
                      size="sm"
                      disabled={deleting === image.id}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      {deleting === image.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
