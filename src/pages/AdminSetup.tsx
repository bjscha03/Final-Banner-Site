import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, Cookie, CheckCircle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const readErrorMessage = async (response: Response, fallback: string) => {
  const raw = await response.text().catch(() => '');
  try {
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed.message || parsed.error || fallback;
  } catch {
    return raw || fallback;
  }
};

const AdminSetup: React.FC = () => {
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [backendMessage, setBackendMessage] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  const refreshAdminStatus = React.useCallback(async () => {
    setIsChecking(true);
    try {
      const response = await fetch('/.netlify/functions/check-admin-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const result = response.ok ? await response.json() : { isAdmin: false };
      setIsAdmin(result.isAdmin === true);
      setBackendMessage(result.message || null);
    } catch (error) {
      console.error('Admin status refresh failed:', error);
      setIsAdmin(false);
    } finally {
      setIsChecking(false);
    }
  }, []);

  React.useEffect(() => {
    refreshAdminStatus();
  }, [refreshAdminStatus]);

  const handleSetAdmin = async () => {
    setIsSubmitting(true);
    setBackendMessage(null);
    try {
      const response = await fetch('/.netlify/functions/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, email }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Admin login failed.'));
      }

      const result = await response.json();
      if (result.isAdmin !== true) {
        throw new Error(result.message || 'Admin login failed.');
      }

      setIsAdmin(true);
      toast({
        title: 'Admin Access Granted',
        description: 'Your server-verified admin session is active. Redirecting to admin dashboard...',
      });

      setTimeout(() => {
        window.location.href = '/admin/orders';
      }, 800);
    } catch (error: any) {
      const message = error?.message || 'Admin login failed.';
      setBackendMessage(message);
      toast({ title: 'Admin Login Failed', description: message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveAdmin = async () => {
    try {
      await fetch('/.netlify/functions/admin-logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
    } catch (error) {
      console.warn('Admin logout request failed:', error);
    }
    setIsAdmin(false);
    toast({ title: 'Admin Access Removed', description: 'Your server-verified admin session has been cleared.' });
  };

  const handleGoToAdmin = () => navigate('/admin/orders');
  const handleGoToMyOrders = () => navigate('/my-orders');

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 py-12">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <Shield className="h-16 w-16 text-blue-600 mx-auto mb-4" />
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Admin Login</h1>
            <p className="text-gray-600">Sign in with server-verified admin credentials.</p>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Cookie className="h-5 w-5" />Current Status</CardTitle>
                <CardDescription>Your current server-backed admin session status</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  {isAdmin ? (
                    <><CheckCircle className="h-5 w-5 text-green-600" /><span className="text-green-600 font-semibold">Admin Session Active</span></>
                  ) : (
                    <><div className="h-5 w-5 rounded-full bg-gray-300" /><span className="text-gray-600">No Admin Session</span></>
                  )}
                </div>
                {isChecking && <p className="mt-2 text-sm text-gray-500">Checking admin session…</p>}
                {backendMessage && <p className="mt-2 text-sm text-amber-700">{backendMessage}</p>}
              </CardContent>
            </Card>

            {!isAdmin ? (
              <Card>
                <CardHeader>
                  <CardTitle>Enable Admin Access</CardTitle>
                  <CardDescription>Credentials are verified by a Netlify Function and stored in an HttpOnly signed cookie.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Input type="email" placeholder="Admin email (optional if password-only admin is configured)" value={email} onChange={(e) => setEmail(e.target.value)} />
                  <Input
                    type="password"
                    placeholder="Enter admin password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSetAdmin(); }}
                  />
                  <Button onClick={handleSetAdmin} disabled={isSubmitting || !password} className="w-full">
                    {isSubmitting ? 'Verifying…' : 'Enable Admin Access'}
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Admin Controls</CardTitle>
                  <CardDescription>You have server-verified admin access.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Button onClick={handleGoToAdmin} className="w-full">Go to Admin Orders</Button>
                    <Button onClick={handleGoToMyOrders} variant="outline" className="w-full">Go to My Orders</Button>
                  </div>
                  <Button onClick={handleRemoveAdmin} variant="destructive" className="w-full">Remove Admin Access</Button>
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
