import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, ExternalLink, CheckCircle2 } from 'lucide-react';

export default function CanvaEditor() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const orderId = searchParams.get('orderId');
  const userId = searchParams.get('userId');
  const designId = searchParams.get('designId');
  const editUrl = searchParams.get('editUrl');
  const token = searchParams.get('token');

  useEffect(() => {
    const errorParam = searchParams.get('error');
    if (errorParam) {
      setError(errorParam);
      setLoading(false);
      return;
    }

    if (!orderId || !userId) {
      setError('Missing required parameters');
      setLoading(false);
      return;
    }

    if (editUrl) {
      console.log('Opening Canva editor:', editUrl);
      window.open(editUrl, '_blank');
    }

    setLoading(false);
  }, [searchParams, orderId, userId, editUrl]);

  const handleBackToDesign = () => {
    navigate('/design');
  };

  const handleOpenCanva = () => {
    if (editUrl) {
      window.open(editUrl, '_blank');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Connecting to Canva...
            </CardTitle>
            <CardDescription>
              Please wait while we set up your design session
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-red-600">Connection Error</CardTitle>
            <CardDescription>
              We encountered an issue connecting to Canva
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-600">{error}</p>
            <Button onClick={handleBackToDesign} className="w-full">
              Back to Design
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-6 w-6 text-green-600" />
            Connected to Canva!
          </CardTitle>
          <CardDescription>
            Your design session is ready
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-2">Next Steps:</h3>
            <ol className="list-decimal list-inside space-y-2 text-sm text-blue-800">
              <li>Click "Open Canva Editor" below to edit your banner</li>
              <li>Customize your design with text, graphics, and effects</li>
              <li>When finished, click "Done" or "Publish" in Canva</li>
              <li>You'll be redirected back here to complete your order</li>
            </ol>
          </div>

          {designId && (
            <div className="text-sm text-gray-600">
              <p><strong>Design ID:</strong> {designId}</p>
              <p><strong>Order ID:</strong> {orderId}</p>
            </div>
          )}

          <div className="flex gap-3">
            {editUrl && (
              <Button 
                onClick={handleOpenCanva} 
                className="flex-1"
                style={{ backgroundColor: '#18448D' }}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Open Canva Editor
              </Button>
            )}
            <Button 
              onClick={handleBackToDesign} 
              variant="outline"
              className="flex-1"
            >
              Back to Design
            </Button>
          </div>

          <div className="text-xs text-gray-500 text-center">
            <p>Having trouble? Contact support at support@bannersonthefly.com</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
