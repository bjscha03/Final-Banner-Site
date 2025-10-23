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

  // Determine redirect URL: checkout context > query param > default
  const fromCheckout = searchParams.get('from') === 'checkout';
  const queryNextUrl = searchParams.get('next');
  const nextUrl = (fromCheckout && isContextValid()) ? getReturnUrl() : (queryNextUrl || '/');
  
  console.log('🔍 SIGN IN PAGE: Redirect calculation', {
    fromCheckout,
    queryNextUrl,
    isContextValid: isContextValid(),
    returnUrl: getReturnUrl(),
    finalNextUrl: nextUrl
  });
  

  

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

      // Clear checkout context after successful sign-in
      if (fromCheckout && isContextValid()) {
        console.log('🛒 SIGN IN: Clearing checkout context and redirecting to:', nextUrl);
        clearCheckoutContext();
      }

      // Small delay to allow cart sync to complete
      setTimeout(() => {
        navigate(nextUrl, { replace: true });
      }, 1000);
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
              Welcome back
            </h2>
            <p className="mt-3 text-base text-gray-600">
              Sign in to create stunning banners
            </p>
            <p className="mt-2 text-sm text-gray-500">
              Don't have an account?{' '}
              <button
                onClick={() => navigate('/sign-up')}
                className="font-semibold text-[#18448D] hover:text-indigo-600 transition-colors duration-200"
              >
                Create one now →
              </button>
            </p>
          </div>

          {/* Main Card */}
          <div className="bg-white rounded-2xl shadow-2xl p-8 space-y-6 border border-gray-100">
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
                  className="h-12 text-base border-gray-300 focus:border-[#18448D] focus:ring-[#18448D] rounded-xl transition-all duration-200"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <Label htmlFor="password" className="text-sm font-semibold text-gray-700">
                    Password
                  </Label>
                  <Link
                    to="/reset-password"
                    className="text-sm font-medium text-[#18448D] hover:text-indigo-600 transition-colors duration-200"
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
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-14 text-base font-semibold bg-[#e16629] hover:bg-[#cf452b] text-white rounded-xl shadow-lg hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 group"
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
            <GoogleButton mode="signin" />
          </div>

          {/* Footer */}
          <p className="text-center text-xs text-gray-500">
            By signing in, you agree to our{' '}
            <a href="/terms" className="text-[#18448D] hover:underline">Terms of Service</a>
            {' '}and{' '}
            <a href="/privacy" className="text-[#18448D] hover:underline">Privacy Policy</a>
          </p>
        </div>
      </div>
    </Layout>
  );
};

export default SignIn;
