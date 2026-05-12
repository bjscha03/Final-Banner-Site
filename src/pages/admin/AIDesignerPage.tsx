import React from 'react';
import { Navigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import { useAuth, isAdmin } from '@/lib/auth';
import { AIPromptPanel } from '@/components/ai-designer/AIPromptPanel';
import { AIBannerPreview } from '@/components/ai-designer/AIBannerPreview';
import { AIProductConfigurator } from '@/components/ai-designer/AIProductConfigurator';
import { AIDesignActions } from '@/components/ai-designer/AIDesignActions';
import { useAIDesignerStore } from '@/store/aiDesigner';

const AIDesignerPage: React.FC = () => {
  const { user, loading } = useAuth();
  const admin = isAdmin(user);
  const s = useAIDesignerStore();

  // Admin-only gate for safe rollout; remove/relax this when customer launch begins.
  if (!loading && !admin) return <Navigate to="/admin/setup" replace />;

  return (
    <Layout>
      <section className="min-h-screen bg-[#080808] text-white p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold text-[#D4AF37] mb-6">AI Banner Designer</h1>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <AIPromptPanel store={s} />
            <AIBannerPreview store={s} />
            <AIProductConfigurator store={s} />
          </div>
          <AIDesignActions store={s} adminId={user?.id || 'unknown'} />
        </div>
      </section>
    </Layout>
  );
};

export default AIDesignerPage;
