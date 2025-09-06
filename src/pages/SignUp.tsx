import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { UserPlus } from 'lucide-react';

const SignUp: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    // Redirect if already signed in
    if (!authLoading && user) {
      navigate('/my-orders');
    }
  }, [user, authLoading, navigate]);

  // Show loading state while checking authentication
  if (authLoading) {
    return (
      <Layout>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading...</p>
          </div>
        </div>
      </Layout>
    );
  }

  // Don't render form if user is already signed in (will redirect)
  if (user) {
    return null;
  }

  return (
    <Layout>
      <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <div className="mx-auto h-12 w-12 bg-blue-100 rounded-full flex items-center justify-center">
              <UserPlus className="h-6 w-6 text-blue-600" />
            </div>
            <h2 className="mt-6 text-3xl font-bold text-gray-900">
              Create your account
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              Or{' '}
              <button
                onClick={() => navigate('/sign-in')}
                className="font-medium text-blue-600 hover:text-blue-500"
              >
                sign in to your existing account
              </button>
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h3 className="font-semibold text-blue-900 mb-3">Development Mode</h3>
            <p className="text-blue-800 text-sm mb-4">
              In development mode, you can simply use the sign-in page with any email/password combination.
              No actual account creation is needed.
            </p>
            <Button
              onClick={() => navigate('/sign-in')}
              className="w-full"
            >
              Go to Sign In
            </Button>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
            <h3 className="font-semibold text-gray-900 mb-3">Production Setup</h3>
            <p className="text-gray-600 text-sm">
              To enable full account creation in production, configure Supabase environment variables:
            </p>
            <ul className="text-gray-600 text-sm mt-2 space-y-1">
              <li>• VITE_SUPABASE_URL</li>
              <li>• VITE_SUPABASE_ANON_KEY</li>
            </ul>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default SignUp;
