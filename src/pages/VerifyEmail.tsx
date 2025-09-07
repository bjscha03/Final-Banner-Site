import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { CheckCircle, XCircle, Loader2, Mail } from 'lucide-react';

export function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'invalid'>('loading');
  const [message, setMessage] = useState('');
  const token = searchParams.get('token');

  useEffect(() => {
    if (!token) {
      setStatus('invalid');
      setMessage('No verification token provided');
      return;
    }

    const verifyEmail = async () => {
      try {
        const response = await fetch('/.netlify/functions/verify-email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token }),
        });

        const result = await response.json();

        if (response.ok && result.ok) {
          setStatus('success');
          setMessage(result.message || 'Email verified successfully!');
        } else {
          setStatus('error');
          setMessage(result.error || 'Failed to verify email');
        }
      } catch (error) {
        console.error('Email verification error:', error);
        setStatus('error');
        setMessage('An error occurred while verifying your email');
      }
    };

    verifyEmail();
  }, [token]);

  const getIcon = () => {
    switch (status) {
      case 'loading':
        return <Loader2 className="h-16 w-16 text-blue-500 animate-spin" />;
      case 'success':
        return <CheckCircle className="h-16 w-16 text-green-500" />;
      case 'error':
      case 'invalid':
        return <XCircle className="h-16 w-16 text-red-500" />;
      default:
        return <Mail className="h-16 w-16 text-gray-500" />;
    }
  };

  const getTitle = () => {
    switch (status) {
      case 'loading':
        return 'Verifying Your Email...';
      case 'success':
        return 'Email Verified!';
      case 'error':
        return 'Verification Failed';
      case 'invalid':
        return 'Invalid Link';
      default:
        return 'Email Verification';
    }
  };

  const getDescription = () => {
    switch (status) {
      case 'loading':
        return 'Please wait while we verify your email address.';
      case 'success':
        return 'Your email has been successfully verified. You can now access all features of your account.';
      case 'error':
        return 'We encountered an issue verifying your email. Please try again or contact support.';
      case 'invalid':
        return 'The verification link is invalid or missing. Please check your email for the correct link.';
      default:
        return 'Verifying your email address...';
    }
  };

  return (
    <Layout>
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <Card>
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                {getIcon()}
              </div>
              <CardTitle className="text-2xl font-bold">
                {getTitle()}
              </CardTitle>
              <CardDescription className="text-gray-600">
                {getDescription()}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {message && (
                <div className={`p-4 rounded-md ${
                  status === 'success' 
                    ? 'bg-green-50 text-green-800 border border-green-200' 
                    : 'bg-red-50 text-red-800 border border-red-200'
                }`}>
                  {message}
                </div>
              )}
              
              <div className="flex flex-col space-y-3">
                {status === 'success' && (
                  <>
                    <Button asChild className="w-full">
                      <Link to="/dashboard">Go to Dashboard</Link>
                    </Button>
                    <Button variant="outline" asChild className="w-full">
                      <Link to="/design">Start Creating Banners</Link>
                    </Button>
                  </>
                )}
                
                {(status === 'error' || status === 'invalid') && (
                  <>
                    <Button variant="outline" asChild className="w-full">
                      <Link to="/signup">Sign Up Again</Link>
                    </Button>
                    <Button variant="outline" asChild className="w-full">
                      <Link to="/signin">Sign In</Link>
                    </Button>
                  </>
                )}
                
                {status === 'loading' && (
                  <div className="text-center text-sm text-gray-500">
                    This may take a few moments...
                  </div>
                )}
              </div>
              
              <div className="text-center">
                <Button variant="link" asChild>
                  <Link to="/">Back to Home</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
