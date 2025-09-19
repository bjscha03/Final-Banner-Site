import React from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Mail, RefreshCw } from 'lucide-react';

export function CheckEmail() {
  const [searchParams] = useSearchParams();
  const email = searchParams.get('email') || 'your email';

  const handleResendEmail = async () => {
    // TODO: Implement resend verification email functionality
    console.log('Resend email functionality to be implemented');
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
              
              <div className="space-y-3">
                <p className="text-sm text-gray-600 text-center">
                  Didn't receive the email? Check your spam folder or click below to resend.
                </p>
                
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={handleResendEmail}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Resend Verification Email
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
