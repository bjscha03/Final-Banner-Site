/**
 * Google OAuth Button Component
 *
 * Initiates Google OAuth flow when clicked
 * Features: Clean Google branding, smooth animations, professional styling
 */

import React, { useState } from 'react';
import { useToast } from '@/components/ui/use-toast';

interface GoogleButtonProps {
  mode?: 'signin' | 'signup';
  className?: string;
}

const GoogleButton: React.FC<GoogleButtonProps> = ({ mode = 'signin', className = '' }) => {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleGoogleSignIn = async () => {
    setLoading(true);

    try {
      // Call the google-auth function to get the authorization URL
      const response = await fetch('/.netlify/functions/google-auth', {
        method: 'POST',
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Response not OK. Status:', response.status);
        console.error('❌ Error text:', errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const result = await response.json();

      if (!result.ok || !result.authUrl) {
        console.error('❌ Invalid response structure:', result);
        throw new Error(result.error || 'Failed to initiate Google sign-in');
      }

      // Store state for CSRF protection
      if (result.state) {
        sessionStorage.setItem('google_oauth_state', result.state);
      }

      // Redirect to Google authorization page
      window.location.href = result.authUrl;

    } catch (error: any) {
      console.error('❌ Google sign-in error:', error);
      
      toast({
        title: 'Google Sign-In Failed',
        description: error.message || 'Unable to connect to Google. Please try again.',
        variant: 'destructive',
      });
      setLoading(false);
    }
  };

  const buttonText = mode === 'signup' ? 'Sign up with Google' : 'Continue with Google';

  return (
    <button
      type="button"
      onClick={handleGoogleSignIn}
      disabled={loading}
      className={`
        group relative w-full h-14 
        bg-white
        hover:bg-gray-50
        text-gray-700 font-semibold text-base
        border-2 border-gray-300
        rounded-xl shadow-md hover:shadow-lg
        transition-all duration-300 ease-in-out
        transform hover:scale-[1.02] active:scale-[0.98]
        disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none
        overflow-hidden
        ${className}
      `}
    >
      {/* Button content */}
      <div className="relative flex items-center justify-center gap-3">
        {loading ? (
          <>
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-gray-400 border-t-transparent"></div>
            <span>Connecting to Google...</span>
          </>
        ) : (
          <>
            {/* Google Logo SVG */}
            <svg className="w-6 h-6" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            <span>{buttonText}</span>
          </>
        )}
      </div>
    </button>
  );
};

export default GoogleButton;
