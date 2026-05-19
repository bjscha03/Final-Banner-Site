import React from 'react';
import { Navigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import { useAuth, isAdmin } from '@/lib/auth';
import { AdminAIDesignerPage } from '@/components/admin-ai-designer/AdminAIDesignerPage';

export default function AIDesignerPage(){
  const {user,loading}=useAuth();
  if(!loading && !isAdmin(user)) return <Navigate to='/admin/setup' replace />;
  return <Layout><AdminAIDesignerPage/></Layout>;
}
