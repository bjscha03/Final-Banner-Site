import React from 'react';
import Layout from '@/components/Layout';

const TestPage: React.FC = () => {
  return (
    <Layout>
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">Test Page</h1>
            <p className="text-gray-600 mb-8">This is a simple test page to verify routing works.</p>
            
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">System Status</h2>
              <div className="space-y-2 text-left">
                <p>✅ React Router: Working</p>
                <p>✅ Layout Component: Working</p>
                <p>✅ Tailwind CSS: Working</p>
                <p>✅ TypeScript: Working</p>
              </div>
            </div>
            
            <div className="mt-8">
              <a 
                href="/admin/setup" 
                className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Go to Admin Setup
              </a>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default TestPage;
