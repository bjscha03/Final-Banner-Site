import React, { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Mail, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export function CheckEmail() {
  const [searchParams] = useSearchParams();
  const email = searchParams.get('email') || 'your email';
  const [isResending, setIsResending] = useState(false);
  const [resendStatus, setResendStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleResendEmail = async () => {
    if (isResending || email === 'your email') return;
    
    setIsResending(true);
    setResendStatus('idle');

    try {
      const response = await fetch('/.netlify/functions/resend-verification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (data.ok) {
        setResendStatus('success');
        toast.success('Verification email sent successfully!');
      } else {
        setResendStatus('error');
        toast.error(data.error || 'Failed to send verification email');
      }
    } catch (error) {
      setResendStatus('error');
      toast.error('Network error. Please try again.');
      console.error('Resend verification error:', error);
    } finally {
      setIsResending(false);
    }
  };

  return (
    <Layout>
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <Card>
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                  <Mail className="h-8 w-8 text-blue-600" />
                </div>
              </div>
              <CardTitle className="text-2xl font-bold">
                Check Your Email
              </CardTitle>
              <CardDescription className="text-gray-600">
                We've sent a verification link to {email}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 rounded-md bg-blue-50 text-blue-800 border border-blue-200">
                <p className="text-sm">
                  Please check your email and click the verification link to activate your account. 
                  The link will expire in 24 hours for security reasons.
                </p>
              </div>
              
              {resendStatus === 'success' && (
                <div className="p-4 rounded-md bg-green-50 text-green-800 border border-green-200 flex items-center">
                  <CheckCircle className="h-4 w-4 mr-2" />
                  <p className="text-sm">
                    New verification email sent successfully! Please check your inbox.
                  </p>
                </div>
              )}

              {resendStatus === 'error' && (
                <div className="p-4 rounded-md bg-red-50 text-red-800 border border-red-200 flex items-center">
                  <AlertCircle className="h-4 w-4 mr-2" />
                  <p className="text-sm">
                    Failed to send verification email. Please try again.
                  </p>
                </div>
              )}
              
              <div className="space-y-3">
                <p className="text-sm text-gray-600 text-center">
                  Didn't receive the email? Check your spam folder or click below to resend.
                </p>
                
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={handleResendEmail}
                  disabled={isResending || email === 'your email'}
                >
                  {isResending ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Resend Verification Email
                    </>
                  )}
                </Button>
                
                <div className="text-center">
                  <Link 
                    to="/sign-in" 
                    className="text-sm text-blue-600 hover:text-blue-500"
                  >
                    Back to Sign In
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}

export default CheckEmail;
