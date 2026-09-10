import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ExternalLink } from 'lucide-react';

export default function CanvaTest() {
  const [orderId, setOrderId] = useState('test-order-123');
  const [userId, setUserId] = useState('test-user-456');
  const [width, setWidth] = useState('4');
  const [height, setHeight] = useState('8');

  const handleStartCanva = () => {
    const params = new URLSearchParams({
      orderId,
      userId,
      width,
      height
    });

    const canvaStartUrl = `/.netlify/functions/canva-start?${params.toString()}`;
    
    console.log('Starting Canva flow:', canvaStartUrl);
    
    window.location.href = canvaStartUrl;
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Canva Integration Test</CardTitle>
            <CardDescription>
              Test the Canva OAuth flow and design creation
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div>
                <Label htmlFor="orderId">Order ID</Label>
                <Input
                  id="orderId"
                  value={orderId}
                  onChange={(e) => setOrderId(e.target.value)}
                  placeholder="test-order-123"
                />
              </div>

              <div>
                <Label htmlFor="userId">User ID</Label>
                <Input
                  id="userId"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  placeholder="test-user-456"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="width">Width (feet)</Label>
                  <Input
                    id="width"
                    type="number"
                    value={width}
                    onChange={(e) => setWidth(e.target.value)}
                    placeholder="4"
                  />
                </div>

                <div>
                  <Label htmlFor="height">Height (feet)</Label>
                  <Input
                    id="height"
                    type="number"
                    value={height}
                    onChange={(e) => setHeight(e.target.value)}
                    placeholder="8"
                  />
                </div>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-semibold text-blue-900 mb-2">Test Flow:</h3>
              <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800">
                <li>Click "Start Canva Flow" below</li>
                <li>You'll be redirected to Canva to authorize</li>
                <li>After authorization, a design will be created</li>
                <li>You'll be redirected back to the editor page</li>
              </ol>
            </div>

            <Button 
              onClick={handleStartCanva}
              className="w-full"
              style={{ backgroundColor: '#18448D' }}
              size="lg"
            >
              <ExternalLink className="h-5 w-5 mr-2" />
              Start Canva Flow
            </Button>

            <div className="text-xs text-gray-500 space-y-1">
              <p><strong>Redirect URI:</strong> https://www.bannersonthefly.com/api/canva/callback</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
