import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, CheckCircle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useAuth, isAdmin as userIsAdmin } from '@/lib/auth';
import { setServerSessionToken } from '@/lib/serverAuth';

const AdminSetup: React.FC = () => {
  const [password, setPassword] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, signOut } = useAuth();

  // Check if already admin
  React.useEffect(() => {
    setIsAdmin(userIsAdmin(user));
  }, [user]);

  const handleSetAdmin = async () => {
    try {
      const response = await fetch('/.netlify/functions/admin-sign-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok || !userIsAdmin(result.user) || !result.sessionToken) {
        throw new Error(result.error || 'Verified administrator credentials are required.');
      }
      setServerSessionToken(result.sessionToken);
      localStorage.setItem('banners_current_user', JSON.stringify(result.user));
      window.dispatchEvent(new Event('user-changed'));
      setIsAdmin(true);
      toast({
        title: 'Admin Access Granted',
        description: 'You now have admin access. Redirecting to admin dashboard...',
      });

      setTimeout(() => {
        window.location.href = '/admin/orders';
      }, 300);
    } catch (error) {
      toast({
        title: 'Admin sign-in failed',
        description: error instanceof Error ? error.message : 'Verified administrator credentials are required.',
        variant: 'destructive',
      });
    }
  };

  const handleRemoveAdmin = async () => {
    setServerSessionToken(null);
    await signOut();
    setIsAdmin(false);
    toast({
      title: 'Admin Access Removed',
      description: 'Admin access has been revoked.',
    });
  };

  const handleGoToAdmin = () => {
    navigate('/admin/orders');
  };

  const handleGoToMyOrders = () => {
    navigate('/my-orders');
  };

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 py-12">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <Shield className="h-16 w-16 text-blue-600 mx-auto mb-4" />
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Admin Login</h1>
            <p className="text-gray-600">Enter the admin password to access the dashboard</p>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Current Status
                </CardTitle>
                <CardDescription>Your current admin access status</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  {isAdmin ? (
                    <>
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      <span className="text-green-600 font-semibold">Admin Access Active</span>
                    </>
                  ) : (
                    <>
                      <div className="h-5 w-5 rounded-full bg-gray-300"></div>
                      <span className="text-gray-600">No Admin Access</span>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            {!isAdmin ? (
              <Card>
                <CardHeader>
                  <CardTitle>Enable Admin Access</CardTitle>
                  <CardDescription>Enter the admin password to enable admin features</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Input
                      type="password"
                      placeholder="Enter admin password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSetAdmin();
                      }}
                    />
                  </div>
                  <Button onClick={handleSetAdmin} className="w-full">
                    Enable Admin Access
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Admin Controls</CardTitle>
                  <CardDescription>You have admin access. Choose what you'd like to do.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Button onClick={handleGoToAdmin} className="w-full">
                      Go to Admin Orders
                    </Button>
                    <Button onClick={handleGoToMyOrders} variant="outline" className="w-full">
                      Go to My Orders
                    </Button>
                  </div>
                  <Button onClick={handleRemoveAdmin} variant="destructive" className="w-full">
                    Remove Admin Access
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default AdminSetup;
