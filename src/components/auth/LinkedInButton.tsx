/**
 * LinkedIn OAuth Button Component
 * 
 * Initiates LinkedIn OAuth flow when clicked
 */

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

interface LinkedInButtonProps {
  className?: string;
}

export const LinkedInButton: React.FC<LinkedInButtonProps> = ({ className = '' }) => {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleLinkedInSignIn = async () => {
    setLoading(true);

    try {
      // Call the linkedin-auth function to get the authorization URL
      const response = await fetch('/.netlify/functions/linkedin-auth', {
        method: 'POST',
      });

      const result = await response.json();

      if (!result.ok || !result.authUrl) {
        throw new Error(result.error || 'Failed to initiate LinkedIn sign-in');
      }

      // Store state for CSRF protection
      if (result.state) {
        sessionStorage.setItem('linkedin_oauth_state', result.state);
      }

      // Redirect to LinkedIn authorization page
      window.location.href = result.authUrl;

    } catch (error: any) {
      console.error('LinkedIn sign-in error:', error);
      toast({
        title: 'LinkedIn Sign-In Failed',
        description: error.message || 'Unable to connect to LinkedIn. Please try again.',
        variant: 'destructive',
      });
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      onClick={handleLinkedInSignIn}
      disabled={loading}
      className={`w-full h-12 text-base font-medium touch-manipulation flex items-center justify-center gap-2 ${className}`}
    >
      {loading ? (
        <>
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
          Connecting to LinkedIn...
        </>
      ) : (
        <>
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
          </svg>
          Continue with LinkedIn
        </>
      )}
    </Button>
  );
};

export default LinkedInButton;
