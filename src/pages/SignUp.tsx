import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Eye, EyeOff, ArrowRight, Check } from 'lucide-react';
import { useScrollToTop } from '@/components/ScrollToTop';
import { LinkedInButton } from '@/components/auth/LinkedInButton';
import GoogleButton from '@/components/auth/GoogleButton';
import { useCheckoutContext } from '@/store/checkoutContext';
import { trackSignUp, trackFBCompleteRegistration } from '@/lib/analytics';

const SignUp: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, loading: authLoading, signUp } = useAuth();
  const { toast } = useToast();
  const { scrollToTop } = useScrollToTop();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const { isInCheckoutFlow, getReturnUrl, clearCheckoutContext, isContextValid } = useCheckoutContext();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Determine redirect URL: checkout context > query param > default
  // CRITICAL FIX: Calculate dynamically at navigation time, not at component mount
  const getNextUrl = () => {
    const queryNextUrl = searchParams.get('next');
    const fromCheckout = searchParams.get('from') === 'checkout';
    
    console.log('🚨 SIGN UP - Getting redirect URL:', {
      'URL': window.location.href,
      'searchParams': searchParams.toString(),
      'queryNextUrl': queryNextUrl,
      'fromCheckout': fromCheckout,
      'isContextValid': isContextValid()
    });
    
    // Priority: 1) next query param, 2) checkout context, 3) design page
    let nextUrl = '/design';
    
    if (queryNextUrl) {
      nextUrl = queryNextUrl;
      console.log('🚨 SIGN UP - Using query param:', nextUrl);
    } else if (fromCheckout && isContextValid()) {
      nextUrl = getReturnUrl();
      console.log('🚨 SIGN UP - Using checkout context:', nextUrl);
    } else {
      console.log('🚨 SIGN UP - Using default design page');
    }
    
    console.log('🚨 SIGN UP - Final redirect:', nextUrl);
    return nextUrl;
  };

  useEffect(() => {
    if (!authLoading && user) {
      const redirectUrl = getNextUrl();
      console.log('🚨 SIGN UP - Auto-redirecting authenticated user to:', redirectUrl);
      navigate(redirectUrl);
    }
  }, [user, authLoading, navigate, searchParams]);

  useEffect(() => {
    scrollToTop();
    if (titleRef.current) {
      setTimeout(() => {
        titleRef.current?.focus();
      }, 100);
    }
  }, [scrollToTop]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password || !fullName) {
      toast({
        title: "Missing Information",
        description: "Please fill in all fields.",
        variant: "destructive",
      });
      return;
    }

    if (password.length < 8) {
      toast({
        title: "Password Too Short",
        description: "Password must be at least 8 characters long.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      await signUp(email, password, fullName);

      
      // Track sign up event
      trackSignUp('email');
      trackFBCompleteRegistration();
      toast({
        title: "Account Created!",
        description: "Please check your email to verify your account.",
      });

      // Redirect to email verification page
      // Pass the nextUrl so after verification they can continue to checkout
      const currentNextUrl = getNextUrl();
      const fromCheckout = searchParams.get('from') === 'checkout';
      
      // Clear checkout context after successful sign-up
      if (fromCheckout && isContextValid()) {
        console.log('🛒 SIGN UP: User came from checkout, preserving context for email verification');
        // Note: We keep the context so after email verification they can return to checkout
      }

      const emailCheckUrl = fromCheckout && isContextValid() 
        ? `/check-email?email=${encodeURIComponent(email)}&next=${encodeURIComponent(currentNextUrl)}`
        : `/check-email?email=${encodeURIComponent(email)}`;
      
      console.log('🚨 SIGN UP - Redirecting to email check:', emailCheckUrl);
      navigate(emailCheckUrl);
    } catch (error: any) {
      toast({
        title: "Sign Up Failed",
        description: error.message || "Unable to create account. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <Layout>
        <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#18448D] mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (user) {
    return null;
  }

  return (
    <Layout>
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-gray-50 relative overflow-hidden">


        <div className="max-w-md w-full space-y-8 relative z-10">
          {/* Header */}
          <div className="text-center">
            <div className="mx-auto h-20 w-20 flex items-center justify-center">
              <img src="/images/logo-icon.svg" alt="Banners on the Fly" className="h-20 w-20" />
            </div>
            <h2
              ref={titleRef}
              tabIndex={-1}
              className="mt-6 text-4xl font-extrabold text-gray-900 tracking-tight"
            >
              Create your account
            </h2>
            <p className="mt-3 text-base text-gray-600">
              Start creating professional banners in minutes
            </p>
            <p className="mt-2 text-sm text-gray-500">
              Already have an account?{' '}
              <button
                onClick={() => {
                  // CRITICAL FIX: Preserve next parameter when navigating to sign-in
                  const currentNextUrl = getNextUrl();
                  const signInUrl = currentNextUrl !== '/design' ? `/sign-in?next=${encodeURIComponent(currentNextUrl)}` : '/sign-in';
                  navigate(signInUrl);
                }}
                className="font-semibold text-[#18448D] hover:text-indigo-600 transition-colors duration-200"
              >
                Sign in →
              </button>
            </p>
          </div>

          {/* Main Card */}
          <div className="bg-white rounded-2xl shadow-2xl p-8 space-y-6 border border-gray-100">
            <form className="space-y-5" onSubmit={handleSubmit}>
              <div>
                <Label htmlFor="fullName" className="text-sm font-semibold text-gray-700 mb-2 block">
                  Full Name
                </Label>
                <Input
                  id="fullName"
                  name="fullName"
                  type="text"
                  autoComplete="name"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="John Doe"
                  className="h-12 text-base border-gray-300 focus:border-[#18448D] focus:ring-[#18448D] rounded-xl transition-all duration-200"
                />
              </div>

              <div>
                <Label htmlFor="email" className="text-sm font-semibold text-gray-700 mb-2 block">
                  Email address
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="h-12 text-base border-gray-300 focus:border-[#18448D] focus:ring-[#18448D] rounded-xl transition-all duration-200"
                />
              </div>

              <div>
                <Label htmlFor="password" className="text-sm font-semibold text-gray-700 mb-2 block">
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="pr-12 h-12 text-base border-gray-300 focus:border-[#18448D] focus:ring-[#18448D] rounded-xl transition-all duration-200"
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center touch-manipulation min-w-[44px] min-h-[44px] justify-center hover:bg-gray-50 rounded-r-xl transition-colors duration-200"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5 text-gray-400" />
                    ) : (
                      <Eye className="h-5 w-5 text-gray-400" />
                    )}
                  </button>
                </div>
                {password && (
                  <div className="mt-2 space-y-1">
                    <div className={`flex items-center gap-2 text-xs ${password.length >= 8 ? 'text-green-600' : 'text-gray-500'}`}>
                      <Check className={`h-3 w-3 ${password.length >= 8 ? 'opacity-100' : 'opacity-30'}`} />
                      <span>At least 8 characters</span>
                    </div>
                  </div>
                )}
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-14 text-base font-semibold bg-[#e16629] hover:bg-[#cf452b] text-white rounded-xl shadow-lg hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 group"
              >
                {loading ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                    <span>Creating account...</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2">
                    <span>Create Account</span>
                    <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform duration-200" />
                  </div>
                )}
              </Button>
            </form>

            {/* Divider */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-white text-gray-500 font-medium">Or continue with</span>
              </div>
            </div>

            {/* LinkedIn Button */}
            <LinkedInButton />
            <GoogleButton mode="signup" />
          </div>

          {/* Footer */}
          <p className="text-center text-xs text-gray-500">
            By creating an account, you agree to our{' '}
            <a href="/terms" className="text-[#18448D] hover:underline">Terms of Service</a>
            {' '}and{' '}
            <a href="/privacy" className="text-[#18448D] hover:underline">Privacy Policy</a>
          </p>
        </div>
      </div>
    </Layout>
  );
};

export default SignUp;
// Cache buster: Sat Nov  1 21:33:50 EDT 2025
