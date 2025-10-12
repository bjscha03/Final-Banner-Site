/**
 * LinkedIn OAuth Button Component - PREMIUM DESIGN WITH EXTENSIVE DEBUG LOGGING
 * 
 * Initiates LinkedIn OAuth flow when clicked
 * Features: Gradient hover effect, smooth animations, professional styling
 */

import React, { useState } from 'react';
import { useToast } from '@/components/ui/use-toast';

interface LinkedInButtonProps {
  className?: string;
}

export const LinkedInButton: React.FC<LinkedInButtonProps> = ({ className = '' }) => {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleLinkedInSignIn = async () => {
    setLoading(true);
    console.log('🔵 ========================================');
    console.log('🔵 LinkedIn button clicked - starting OAuth flow...');
    console.log('🔵 ========================================');

    try {
      // Call the linkedin-auth function to get the authorization URL
      console.log('🔵 Calling /.netlify/functions/linkedin-auth...');
      console.log('🔵 Current URL:', window.location.href);
      
      const response = await fetch('/.netlify/functions/linkedin-auth', {
        method: 'POST',
      });

      console.log('🔵 Response received!');
      console.log('🔵 Response status:', response.status);
      console.log('🔵 Response OK:', response.ok);
      console.log('🔵 Response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Response not OK. Status:', response.status);
        console.error('❌ Error text:', errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      console.log('🔵 Response data:', result);
      console.log('🔵 Auth URL:', result.authUrl);
      console.log('🔵 State:', result.state);
      console.log('🔵 OK flag:', result.ok);

      if (!result.ok || !result.authUrl) {
        console.error('❌ Invalid response structure:', result);
        throw new Error(result.error || 'Failed to initiate LinkedIn sign-in');
      }

      // Store state for CSRF protection
      if (result.state) {
        sessionStorage.setItem('linkedin_oauth_state', result.state);
        console.log('🔵 Stored OAuth state in sessionStorage:', result.state);
      }

      // Redirect to LinkedIn authorization page
      console.log('🔵 ========================================');
      console.log('🔵 REDIRECTING TO LINKEDIN NOW!');
      console.log('🔵 Target URL:', result.authUrl);
      console.log('🔵 ========================================');
      
      window.location.href = result.authUrl;

    } catch (error: any) {
      console.error('❌ ========================================');
      console.error('❌ LinkedIn sign-in error!');
      console.error('❌ Error type:', error.constructor.name);
      console.error('❌ Error message:', error.message);
      console.error('❌ Error stack:', error.stack);
      console.error('❌ ========================================');
      
      toast({
        title: 'LinkedIn Sign-In Failed',
        description: error.message || 'Unable to connect to LinkedIn. Please try again.',
        variant: 'destructive',
      });
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleLinkedInSignIn}
      disabled={loading}
      className={`
        group relative w-full h-14 
        bg-gradient-to-r from-[#0077b5] to-[#00a0dc]
        hover:from-[#006399] hover:to-[#0088b8]
        text-white font-semibold text-base
        rounded-xl shadow-lg hover:shadow-xl
        transition-all duration-300 ease-in-out
        transform hover:scale-[1.02] active:scale-[0.98]
        disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none
        overflow-hidden
        ${className}
      `}
    >
      {/* Animated background shimmer effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000"></div>
      
      {/* Button content */}
      <div className="relative flex items-center justify-center gap-3">
        {loading ? (
          <>
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
            <span>Connecting to LinkedIn...</span>
          </>
        ) : (
          <>
            <svg className="w-6 h-6 drop-shadow-md" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
            </svg>
            <span className="drop-shadow-sm">Continue with LinkedIn</span>
          </>
        )}
      </div>
    </button>
  );
};

export default LinkedInButton;
