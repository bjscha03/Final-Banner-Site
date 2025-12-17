import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, Cookie, CheckCircle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const AdminSetup: React.FC = () => {
  const [password, setPassword] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Check if already admin
  React.useEffect(() => {
    const hasAdminCookie = document.cookie.includes('admin=1');
    setIsAdmin(hasAdminCookie);
  }, []);

  const handleSetAdmin = () => {
    console.log('🔐 Admin setup attempt:', { password: password.substring(0, 3) + '***' });

    if (password === 'admin123' || password === 'admin') {
      // Set admin cookie for 24 hours with proper domain settings
      const expires = new Date();
      expires.setTime(expires.getTime() + (24 * 60 * 60 * 1000));

      // Set cookie with multiple configurations to ensure it works in production
      const cookieString = `admin=1; expires=${expires.toUTCString()}; path=/; SameSite=Lax`;
      document.cookie = cookieString;

      console.log('🍪 Setting admin cookie:', cookieString);

      // Create admin user in localStorage with valid UUID
      const adminUser = {
        id: '00000000-0000-0000-0000-000000000001',
        email: 'admin@dev.local',
        is_admin: true,
      };
      localStorage.setItem('banners_current_user', JSON.stringify(adminUser));

      console.log('💾 Stored admin user in localStorage:', adminUser);

      setIsAdmin(true);
      toast({
        title: "Admin Access Granted",
        description: "You now have admin access for 24 hours. Refreshing page...",
      });
      
      // Refresh the page to ensure auth state is properly updated everywhere
      setTimeout(() => {
        window.location.reload();
      }, 1000);

      // Verify the cookie was set
      setTimeout(() => {
        const cookieCheck = document.cookie.includes('admin=1');
        console.log('🔍 Cookie verification:', { cookieCheck, allCookies: document.cookie });
      }, 100);
    } else {
      toast({
        title: "Invalid Password",
        description: "Please enter the correct admin password.",
        variant: "destructive",
      });
    }
  };

  const handleRemoveAdmin = () => {
    document.cookie = 'admin=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/';
    localStorage.removeItem('banners_current_user');
    setIsAdmin(false);
    toast({
      title: "Admin Access Removed",
      description: "Admin access has been revoked.",
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
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Admin Setup</h1>
            <p className="text-gray-600">Set up admin access for development</p>
          </div>

          <div className="space-y-6">
            {/* Current Status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Cookie className="h-5 w-5" />
                  Current Status
                </CardTitle>
                <CardDescription>
                  Your current admin access status
                </CardDescription>
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

            {/* Admin Access Control */}
            {!isAdmin ? (
              <Card>
                <CardHeader>
                  <CardTitle>Enable Admin Access</CardTitle>
                  <CardDescription>
                    Enter the admin password to enable admin features
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Input
                      type="password"
                      placeholder="Enter admin password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSetAdmin()}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Hint: Try "admin" or "admin123"
                    </p>
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
                  <CardDescription>
                    You have admin access. Choose what you'd like to do.
                  </CardDescription>
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

            {/* Instructions */}
            <Card>
              <CardHeader>
                <CardTitle>Development Instructions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-gray-600">
                <p>
                  <strong>For Development:</strong> This page sets a cookie <code className="bg-gray-100 px-1 rounded">admin=1</code> 
                  to simulate admin access.
                </p>
                <p>
                  <strong>For Production:</strong> Replace this with proper authentication using Supabase 
                  and user roles in the database.
                </p>
                <p>
                  <strong>Sample Data:</strong> The system includes sample orders for testing. 
                  Real orders will be stored when you integrate with Supabase.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default AdminSetup;
