import React, { useState } from 'react';
import { Loader2, CheckCircle, XCircle, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Layout from '@/components/Layout';

const AdminSeed: React.FC = () => {
  const [isSeeding, setIsSeeding] = useState(false);
  const [seedToken, setSeedToken] = useState('');
  const [results, setResults] = useState<Array<{ type: string; success: boolean; message: string }>>([]);

  const EXPECTED_SEED_TOKEN = 'banners-on-the-fly-admin-seed-2024';

  const handleSeedAdmin = async () => {
    if (seedToken !== EXPECTED_SEED_TOKEN) {
      setResults([{ type: 'error', success: false, message: 'Invalid seed token' }]);
      return;
    }

    setIsSeeding(true);
    setResults([]);

    try {
      // In development mode, just set admin cookie
      document.cookie = 'admin=1; path=/; max-age=86400'; // 24 hours

      setResults([
        {
          type: 'admin',
          success: true,
          message: 'Development mode: Admin cookie set successfully'
        },
        {
          type: 'info',
          success: true,
          message: 'You now have admin access. Use any email containing "admin" when signing in.'
        }
      ]);

    } catch (error) {
      setResults([{
        type: 'error',
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      }]);
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <Layout>
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white rounded-2xl shadow-md border border-gray-200 p-8">
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Development Admin Setup</h1>
              <p className="text-gray-600">
                Set up admin access for development mode (no Supabase required)
              </p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <div className="flex items-start">
                <Info className="h-5 w-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" />
                <div>
                  <h3 className="text-sm font-medium text-blue-900">Development Mode</h3>
                  <p className="text-sm text-blue-700 mt-1">
                    This will set a local admin cookie. In production, this would create a real admin user in Supabase.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <Label htmlFor="seedToken" className="text-sm font-medium text-gray-700">
                  Seed Token
                </Label>
                <Input
                  id="seedToken"
                  type="password"
                  value={seedToken}
                  onChange={(e) => setSeedToken(e.target.value)}
                  placeholder="Enter seed token"
                  className="mt-1"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Use: banners-on-the-fly-admin-seed-2024
                </p>
              </div>

              <Button
                onClick={handleSeedAdmin}
                disabled={isSeeding || !seedToken}
                className="w-full"
              >
                {isSeeding ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Seeding...
                  </>
                ) : (
                  'Seed Admin User & Sample Data'
                )}
              </Button>

              {/* Results */}
              {results.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold text-gray-900">Results</h3>
                  {results.map((result, index) => (
                    <div
                      key={index}
                      className={`flex items-start space-x-3 p-4 rounded-lg ${
                        result.success 
                          ? 'bg-green-50 border border-green-200' 
                          : 'bg-red-50 border border-red-200'
                      }`}
                    >
                      {result.success ? (
                        <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-500 mt-0.5" />
                      )}
                      <div>
                        <p className={`font-medium ${
                          result.success ? 'text-green-800' : 'text-red-800'
                        }`}>
                          {result.type === 'admin' ? 'Admin User' : 
                           result.type === 'orders' ? 'Sample Orders' : 'Error'}
                        </p>
                        <p className={`text-sm ${
                          result.success ? 'text-green-700' : 'text-red-700'
                        }`}>
                          {result.message}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Warning */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <div className="w-5 h-5 bg-amber-400 rounded-full flex items-center justify-center mt-0.5">
                    <span className="text-white text-xs font-bold">!</span>
                  </div>
                  <div>
                    <p className="font-medium text-amber-800">Important</p>
                    <p className="text-sm text-amber-700 mt-1">
                      This page should be removed or access-controlled after initial setup.
                      The seeding process should only be run once.
                    </p>
                  </div>
                </div>
              </div>

              {/* Environment Variables Info */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="font-medium text-blue-800 mb-2">Required Environment Variables:</p>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li>• VITE_SUPABASE_URL</li>
                  <li>• VITE_SUPABASE_SERVICE_ROLE_KEY</li>
                  <li>• VITE_ADMIN_EMAIL</li>
                  <li>• VITE_ADMIN_PASSWORD</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default AdminSeed;
