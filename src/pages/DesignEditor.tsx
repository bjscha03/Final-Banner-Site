import React from 'react';
import Layout from '@/components/Layout';
import PageHeader from '@/components/PageHeader';
import { Palette } from 'lucide-react';
import BannerEditorLayout from '@/components/design/BannerEditorLayout';
import { useState } from 'react';
import NewAIGenerationModal from '@/components/design/NewAIGenerationModal';

const DesignEditor: React.FC = () => {
  const [aiModalOpen, setAiModalOpen] = useState(false);

  return (
    <Layout>
      <PageHeader
        title="Advanced Banner Editor"
        subtitle="Full-featured design tool with text, shapes, and templates"
        icon={Palette}
      />
      
      <BannerEditorLayout onOpenAIModal={() => setAiModalOpen(true)} />
      
      <NewAIGenerationModal 
        open={aiModalOpen} 
        onOpenChange={setAiModalOpen} 
      />
    </Layout>
  );
};

export default DesignEditor;
