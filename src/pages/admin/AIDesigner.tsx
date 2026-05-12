import React from 'react';
import { Navigate } from 'react-router-dom';
import Design from '@/pages/Design';
import { useAuth, isAdmin } from '@/lib/auth';

const AdminAIDesigner: React.FC = () => {
  const { user } = useAuth();
  if (!user || !isAdmin(user)) {
    return <Navigate to="/admin/setup" replace />;
  }
  return <Design allowAdminAI />;
};

export default AdminAIDesigner;
