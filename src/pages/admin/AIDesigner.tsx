import React from 'react';
import { Navigate } from 'react-router-dom';
import Design from '@/pages/Design';
import { useAuth, isAdmin } from '@/lib/auth';
import Layout from '@/components/Layout';
import { Loader2 } from 'lucide-react';

const AdminAIDesigner: React.FC = () => {
  const { user, loading: authLoading } = useAuth();

  // Mirror /admin/orders guard behavior: wait for auth state to finish
  // loading before evaluating admin redirect conditions.
  if (authLoading) {
    return (
      <Layout>
        <div className="min-h-[50vh] flex items-center justify-center">
          <div className="inline-flex items-center gap-2 text-gray-600">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Checking admin access…</span>
          </div>
        </div>
      </Layout>
    );
  }

  if (!user || !isAdmin(user)) {
    return <Navigate to="/admin/setup" replace />;
  }
  return <Design allowAdminAI />;
};

export default AdminAIDesigner;
