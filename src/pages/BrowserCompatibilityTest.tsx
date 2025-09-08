import React, { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { generateUUID, safeStorage } from '@/lib/utils';
import { getOrdersAdapter } from '@/lib/orders/adapter';
import { useAuth } from '@/lib/auth';

interface TestResult {
  name: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  details?: string;
}

const BrowserCompatibilityTest: React.FC = () => {
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const { user } = useAuth();

  const runTests = async () => {
    setIsRunning(true);
    const results: TestResult[] = [];

    // Test 1: UUID Generation
    try {
      const uuid1 = generateUUID();
      const uuid2 = generateUUID();
      
      if (uuid1 && uuid2 && uuid1 !== uuid2 && uuid1.length === 36) {
        results.push({
          name: 'UUID Generation',
          status: 'pass',
          message: 'UUID generation working correctly',
          details: `Generated: ${uuid1}`
        });
      } else {
        results.push({
          name: 'UUID Generation',
          status: 'fail',
          message: 'UUID generation failed',
          details: `UUID1: ${uuid1}, UUID2: ${uuid2}`
        });
      }
    } catch (error) {
      results.push({
        name: 'UUID Generation',
        status: 'fail',
        message: 'UUID generation threw error',
        details: error.message
      });
    }

    // Test 2: Safe Storage
    try {
      const testKey = '__browser_test_key__';
      const testValue = 'test_value_' + Date.now();
      
      safeStorage.setItem(testKey, testValue);
      const retrieved = safeStorage.getItem(testKey);
      safeStorage.removeItem(testKey);
      
      if (retrieved === testValue) {
        results.push({
          name: 'Safe Storage',
          status: 'pass',
          message: 'Storage operations working correctly'
        });
      } else {
        results.push({
          name: 'Safe Storage',
          status: 'warning',
          message: 'Storage using memory fallback',
          details: 'localStorage may be disabled or in private browsing mode'
        });
      }
    } catch (error) {
      results.push({
        name: 'Safe Storage',
        status: 'fail',
        message: 'Storage operations failed',
        details: error.message
      });
    }

    // Test 3: Environment Variables
    try {
      const hasNetlifyUrl = !!import.meta.env?.NETLIFY_DATABASE_URL;
      const hasViteUrl = !!import.meta.env?.VITE_DATABASE_URL;
      
      if (hasNetlifyUrl || hasViteUrl) {
        results.push({
          name: 'Environment Variables',
          status: 'pass',
          message: 'Database URL configured',
          details: `Netlify: ${hasNetlifyUrl}, Vite: ${hasViteUrl}`
        });
      } else {
        results.push({
          name: 'Environment Variables',
          status: 'warning',
          message: 'No database URL found',
          details: 'Will use local storage adapter'
        });
      }
    } catch (error) {
      results.push({
        name: 'Environment Variables',
        status: 'fail',
        message: 'Error accessing environment variables',
        details: error.message
      });
    }

    // Test 4: Orders Adapter
    try {
      const adapter = getOrdersAdapter();
      
      if (adapter && typeof adapter.create === 'function' && typeof adapter.listByUser === 'function') {
        results.push({
          name: 'Orders Adapter',
          status: 'pass',
          message: 'Orders adapter initialized successfully'
        });
      } else {
        results.push({
          name: 'Orders Adapter',
          status: 'fail',
          message: 'Orders adapter missing required methods'
        });
      }
    } catch (error) {
      results.push({
        name: 'Orders Adapter',
        status: 'fail',
        message: 'Orders adapter initialization failed',
        details: error.message
      });
    }

    // Test 5: Mobile Detection
    try {
      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const hasMatchMedia = typeof window.matchMedia === 'function';
      
      results.push({
        name: 'Mobile Detection',
        status: 'pass',
        message: `Device: ${isMobileDevice ? 'Mobile' : 'Desktop'}, MatchMedia: ${hasMatchMedia}`,
        details: navigator.userAgent
      });
    } catch (error) {
      results.push({
        name: 'Mobile Detection',
        status: 'fail',
        message: 'Mobile detection failed',
        details: error.message
      });
    }

    // Test 6: Fetch API
    try {
      // Test if fetch is available and working
      const testResponse = await fetch('/placeholder.svg', { method: 'HEAD' });
      
      results.push({
        name: 'Fetch API',
        status: 'pass',
        message: `Fetch API working (status: ${testResponse.status})`
      });
    } catch (error) {
      results.push({
        name: 'Fetch API',
        status: 'fail',
        message: 'Fetch API failed',
        details: error.message
      });
    }

    // Test 7: Orders Loading (if user is logged in)
    if (user) {
      try {
        const adapter = getOrdersAdapter();
        const orders = await adapter.listByUser(user.id);
        
        results.push({
          name: 'Orders Loading',
          status: 'pass',
          message: `Successfully loaded ${orders.length} orders`
        });
      } catch (error) {
        results.push({
          name: 'Orders Loading',
          status: 'fail',
          message: 'Failed to load orders',
          details: error.message
        });
      }
    } else {
      results.push({
        name: 'Orders Loading',
        status: 'warning',
        message: 'User not logged in - cannot test orders loading'
      });
    }

    setTestResults(results);
    setIsRunning(false);
  };

  useEffect(() => {
    // Run tests automatically on component mount
    runTests();
  }, [user]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pass':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'fail':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'warning':
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pass':
        return 'bg-green-100 text-green-800';
      case 'fail':
        return 'bg-red-100 text-red-800';
      case 'warning':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const passCount = testResults.filter(r => r.status === 'pass').length;
  const failCount = testResults.filter(r => r.status === 'fail').length;
  const warningCount = testResults.filter(r => r.status === 'warning').length;

  return (
    <Layout>
      <div className="bg-gray-50 py-8 min-h-[calc(100vh-4rem)]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">Browser Compatibility Test</h1>
            <p className="text-gray-600 mb-6">
              This page tests various browser compatibility features to ensure the orders system works correctly.
            </p>
            
            <div className="flex items-center gap-4 mb-6">
              <Button onClick={runTests} disabled={isRunning}>
                {isRunning ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Running Tests...
                  </>
                ) : (
                  'Run Tests Again'
                )}
              </Button>
              
              {testResults.length > 0 && (
                <div className="flex gap-2">
                  <Badge className="bg-green-100 text-green-800">{passCount} Passed</Badge>
                  <Badge className="bg-yellow-100 text-yellow-800">{warningCount} Warnings</Badge>
                  <Badge className="bg-red-100 text-red-800">{failCount} Failed</Badge>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            {testResults.map((result, index) => (
              <Card key={index}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      {getStatusIcon(result.status)}
                      {result.name}
                    </CardTitle>
                    <Badge className={getStatusColor(result.status)}>
                      {result.status.toUpperCase()}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base mb-2">
                    {result.message}
                  </CardDescription>
                  {result.details && (
                    <div className="bg-gray-100 p-3 rounded text-sm font-mono text-gray-700">
                      {result.details}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {testResults.length === 0 && !isRunning && (
            <Card>
              <CardContent className="text-center py-8">
                <p className="text-gray-500">No test results yet. Click "Run Tests" to begin.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default BrowserCompatibilityTest;
