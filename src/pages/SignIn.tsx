import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth, signIn } from '@/lib/auth';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Eye, EyeOff, ArrowRight } from 'lucide-react';
import { useScrollToTop } from '@/components/ScrollToTop';
import { LinkedInButton } from '@/components/auth/LinkedInButton';
import GoogleButton from '@/components/auth/GoogleButton';
import { useCheckoutContext } from '@/store/checkoutContext';
import { trackLogin } from '@/lib/analytics';

const SignIn: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { scrollToTop } = useScrollToTop();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const { isInCheckoutFlow, getReturnUrl, clearCheckoutContext, isContextValid } = useCheckoutContext();

  // Determine redirect URL: query param > checkout context > default
  // CRITICAL FIX: Prioritize query param to ensure checkout redirect works
  const getNextUrl = () => {
    const queryNextUrl = searchParams.get('next');
    const fromCheckout = searchParams.get('from') === 'checkout';
    
    console.log('🚨 SIGN IN - Getting redirect URL:', {
      'URL': window.location.href,
      'searchParams': searchParams.toString(),
      'queryNextUrl': queryNextUrl,
      'fromCheckout': fromCheckout,
      'isContextValid': isContextValid()
    });
    
    // Priority: 1) next query param, 2) checkout context, 3) home
    let nextUrl = '/';
    
    if (queryNextUrl) {
      nextUrl = queryNextUrl;
      console.log('🚨 SIGN IN - Using query param:', nextUrl);
    } else if (fromCheckout && isContextValid()) {
      nextUrl = getReturnUrl();
      console.log('🚨 SIGN IN - Using checkout context:', nextUrl);
    } else {
      console.log('🚨 SIGN IN - Using default home page');
    }
    
    console.log('🚨 SIGN IN - Final redirect:', nextUrl);
    return nextUrl;
  };
  

  

  // DISABLED: Manual sign-in handles navigation with proper delay for cart sync
  // useEffect(() => {
  //   if (!authLoading && user) {
  //     navigate(nextUrl, { replace: true });
  //   }
  // }, [user, authLoading, navigate, nextUrl]);

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

    if (!email || !password) {
      toast({
        title: "Missing Information",
        description: "Please enter both email and password.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      await signIn(email, password);


      
      // Track login event
      trackLogin('email');
      toast({
        title: "Welcome back!",
        description: "You have been signed in successfully.",
      });

      // DON'T clear checkout context here - let useCartSync hook read it first!
      // The checkout context will be cleared after cart merge is complete
      const fromCheckout = searchParams.get('from') === 'checkout';
      if (fromCheckout && isContextValid()) {
        console.log('🛒 SIGN IN: Checkout context preserved for cart merge');
        // clearCheckoutContext(); // MOVED: Will be cleared by useCartSync after merge
      }

      // Small delay to allow cart sync to complete (kept short so admins don't see a blank screen)
      setTimeout(() => {
        const redirectUrl = getNextUrl();
        console.log('🚨 SIGN IN SUCCESS - About to navigate');
        console.log('🚨 Current URL:', window.location.href);
        console.log('🚨 Search params:', searchParams.toString());
        console.log('🚨 Redirect URL:', redirectUrl);
        navigate(redirectUrl, { replace: true });
      }, 500);
    } catch (error: any) {
      if (error.message && error.message.includes('email verification')) {
        toast({
          title: "Email Verification Required",
          description: "Please verify your email address before signing in.",
          variant: "destructive",
        });
        navigate(`/check-email?email=${encodeURIComponent(email)}`);
      } else {
        toast({
          title: "Sign In Failed",
          description: error.message || "Please check your credentials and try again.",
          variant: "destructive",
        });
      }
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
    <Layout showFooterBanner={false}>
      <div className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center bg-[#F7F7F7] px-4 py-12 sm:px-6 lg:px-8">


        <div className="relative z-10 w-full max-w-md space-y-8">
          {/* Header */}
          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center">
              <img src="/images/logo-icon.svg" alt="Banners on the Fly" className="h-16 w-16" />
            </div>
            <h2
              ref={titleRef}
              tabIndex={-1}
              className="mt-5 font-display text-3xl font-bold tracking-[-0.035em] text-[#0B1F3A] sm:text-4xl"
            >
              Welcome back
            </h2>
            <p className="mt-3 text-base text-gray-600">
              Sign in to continue your order or review past orders.
            </p>
            <p className="mt-2 text-sm text-gray-500">
              Don't have an account?{' '}
              <button
                onClick={() => {
                  // CRITICAL FIX: Preserve next parameter when navigating to sign-up
                  const currentNextUrl = getNextUrl();
                  const signUpUrl = currentNextUrl !== '/' ? `/sign-up?next=${encodeURIComponent(currentNextUrl)}` : '/sign-up';
                  navigate(signUpUrl);
                }}
                className="font-semibold text-[#0B1F3A] underline decoration-[#FF6A00] decoration-2 underline-offset-4 hover:text-[#A63C00]"
              >
                Create one now →
              </button>
            </p>
          </div>

          {/* Main Card */}
          <div className="space-y-6 border border-slate-200 border-t-4 border-t-[#FF6A00] bg-white p-7 shadow-[0_12px_30px_rgba(11,31,58,0.07)] sm:p-8">
            <form className="space-y-5" onSubmit={handleSubmit}>
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
                  className="h-12 rounded-md border-slate-300 text-base focus:border-[#0B1F3A] focus:ring-[#FF6A00]"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <Label htmlFor="password" className="text-sm font-semibold text-gray-700">
                    Password
                  </Label>
                  <Link
                    to="/reset-password"
                    className="text-sm font-semibold text-[#0B1F3A] underline decoration-[#FF6A00] underline-offset-4 hover:text-[#A63C00]"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="h-12 rounded-md border-slate-300 pr-12 text-base focus:border-[#0B1F3A] focus:ring-[#FF6A00]"
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 flex min-h-[44px] min-w-[44px] touch-manipulation items-center justify-center rounded-r-md pr-3 transition-colors hover:bg-slate-50"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5 text-gray-400" />
                    ) : (
                      <Eye className="h-5 w-5 text-gray-400" />
                    )}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="group h-14 w-full rounded-md bg-[#FF6A00] text-base font-bold text-[#0B1F3A] shadow-none hover:bg-[#E65F00]"
              >
                {loading ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                    <span>Signing in...</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2">
                    <span>Sign in</span>
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
            {/* Google sign-in temporarily disabled while OAuth callback is being stabilized.
                Re-enable by restoring: <GoogleButton mode="signin" returnUrl={getNextUrl()} /> */}
          </div>

          {/* Footer */}
          <p className="text-center text-xs text-gray-500">
            By signing in, you agree to our{' '}
            <a href="/terms" className="text-[#0B1F3A] underline decoration-[#FF6A00] underline-offset-2">Terms of Service</a>
            {' '}and{' '}
            <a href="/privacy" className="text-[#0B1F3A] underline decoration-[#FF6A00] underline-offset-2">Privacy Policy</a>
          </p>
        </div>
      </div>
    </Layout>
  );
};

export default SignIn;
