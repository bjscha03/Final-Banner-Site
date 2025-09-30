import React from 'react';
import Layout from '@/components/Layout';
import BannerDesigner, { ExportState } from '@/components/BannerDesigner';

const BannerDesignerTest: React.FC = () => {
  const handleStateChange = (state: ExportState) => {
    console.log('Banner state updated:', state);
  };

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/50 pt-8 pb-4">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 via-blue-800 to-indigo-800 bg-clip-text text-transparent mb-4">
              VistaPrint-Style Banner Designer
            </h1>
            <p className="text-lg text-gray-700 max-w-2xl mx-auto">
              Professional banner design tool with drag & resize, grommets, and live preview
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
            <div className="h-[600px]">
              <BannerDesigner
                widthIn={48}
                heightIn={24}
                dpi={96}
                bleedIn={0.25}
                safeMarginIn={0.5}
                grommetEveryIn={24}
                cornerGrommetOffsetIn={1}
                onChange={handleStateChange}
              />
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default BannerDesignerTest;
