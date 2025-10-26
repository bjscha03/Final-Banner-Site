import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, ExternalLink, CheckCircle2, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function CanvaEditor() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const orderId = searchParams.get('orderId');
  const userId = searchParams.get('userId');
  const designId = searchParams.get('designId');
  const editUrl = searchParams.get('editUrl');
  const success = searchParams.get('success');
  const width = searchParams.get('width');
  const height = searchParams.get('height');

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

  const handleDoneDesigning = async () => {
    // ✅ SECURE - Use userId instead of token
    if (!designId || !userId) {
      toast({
        title: "Error",
        description: "Missing design information",
        variant: "destructive"
      });
      return;
    }

    setExporting(true);

    try {
      // ✅ SECURE - Pass userId, not accessToken
      const response = await fetch('/.netlify/functions/canva-export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          designId,
          userId  // ✅ Changed from accessToken to userId
        })
      });

      const data = await response.json();

      if (!response.ok) {
        // Check if user needs to re-authorize
        if (data.needsReauth) {
          toast({
            title: "Authorization Required",
            description: "Please reconnect your Canva account",
            variant: "destructive"
          });
          // Could redirect to re-auth flow here
          return;
        }
        throw new Error(data.error || 'Export failed');
      }

      if (data.success && data.imageUrl) {
        // Store the Cloudinary URL and metadata
        sessionStorage.setItem('canva-design-url', data.imageUrl);
        sessionStorage.setItem('canva-design-publicId', data.publicId);
        sessionStorage.setItem('canva-design-name', data.fileName);
        
        // DO NOT store pixel dimensions - they will be treated as inches and cause massive pricing errors
        // User will set their desired print dimensions on the Design page
        
        toast({
          title: "Success!",
          description: "Your design has been imported"
        });
        
        // Navigate back to design page
        navigate('/design');
      } else {
        throw new Error('No image URL received from export');
      }
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: "Export Failed",
        description: error instanceof Error ? error.message : 'Failed to export design',
        variant: "destructive"
      });
    } finally {
      setExporting(false);
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
              <li>When finished, come back here and click "Done Designing"</li>
              <li>We'll import your design and you can complete your order</li>
            </ol>
          </div>

          {designId && (
            <div className="text-sm text-gray-600">
              <p><strong>Design ID:</strong> {designId}</p>
              <p><strong>Order ID:</strong> {orderId}</p>
            </div>
          )}

          <div className="flex flex-col gap-3">
            {editUrl && (
              <Button 
                onClick={handleOpenCanva} 
                className="w-full"
                style={{ backgroundColor: '#18448D' }}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Open Canva Editor
              </Button>
            )}
            
            <Button 
              onClick={handleDoneDesigning}
              disabled={exporting}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              {exporting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importing Design...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Done Designing - Import to Site
                </>
              )}
            </Button>

            <Button 
              onClick={handleBackToDesign} 
              variant="outline"
              className="w-full"
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
