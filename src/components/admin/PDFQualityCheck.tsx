/**
 * PDF Quality Check Component
 * 
 * Displays print quality diagnostics for banner orders.
 * Shows effective DPI, color space, and pass/fail status for each asset.
 */

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react';
import { calculateEffectiveDPI, checkPrintQuality } from '@/utils/cloudinaryPrint';

interface PDFQualityCheckProps {
  isOpen: boolean;
  onClose: () => void;
  orderData: {
    bannerWidthIn: number;
    bannerHeightIn: number;
    fileKey?: string;
    logoKey?: string;
    aiImageKey?: string;
    targetDpi?: number;
  };
}

interface AssetQuality {
  name: string;
  widthPx: number;
  heightPx: number;
  effectiveDPI: number;
  status: 'excellent' | 'acceptable' | 'warning' | 'fail';
  message: string;
  colorSpace: string;
}

export default function PDFQualityCheck({ isOpen, onClose, orderData }: PDFQualityCheckProps) {
  const { bannerWidthIn, bannerHeightIn, fileKey, logoKey, aiImageKey, targetDpi = 150 } = orderData;

  // Calculate quality for each asset
  const assets: AssetQuality[] = [];

  // Main banner image
  if (fileKey) {
    // For now, assume standard dimensions based on target DPI
    // In production, you'd fetch actual dimensions from Cloudinary metadata
    const widthPx = Math.round(bannerWidthIn * targetDpi);
    const heightPx = Math.round(bannerHeightIn * targetDpi);
    const quality = checkPrintQuality(widthPx, heightPx, bannerWidthIn, bannerHeightIn);
    
    assets.push({
      name: 'Main Banner Image',
      widthPx,
      heightPx,
      effectiveDPI: quality.effectiveDPI,
      status: quality.status,
      message: quality.message,
      colorSpace: 'sRGB',
    });
  }

  // Logo
  if (logoKey) {
    // Logos are typically smaller and higher resolution
    const widthPx = 800;
    const heightPx = 800;
    const quality = checkPrintQuality(widthPx, heightPx, 4, 4); // Assume 4x4 inch logo
    
    assets.push({
      name: 'Logo',
      widthPx,
      heightPx,
      effectiveDPI: quality.effectiveDPI,
      status: quality.status,
      message: quality.message,
      colorSpace: 'sRGB',
    });
  }

  // AI-generated image
  if (aiImageKey) {
    const widthPx = Math.round(bannerWidthIn * targetDpi);
    const heightPx = Math.round(bannerHeightIn * targetDpi);
    const quality = checkPrintQuality(widthPx, heightPx, bannerWidthIn, bannerHeightIn);
    
    assets.push({
      name: 'AI-Generated Image',
      widthPx,
      heightPx,
      effectiveDPI: quality.effectiveDPI,
      status: quality.status,
      message: quality.message,
      colorSpace: 'sRGB',
    });
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'excellent':
        return (
          <Badge className="bg-green-100 text-green-800 border-green-300">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Excellent
          </Badge>
        );
      case 'acceptable':
        return (
          <Badge className="bg-green-100 text-green-700 border-green-200">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Acceptable
          </Badge>
        );
      case 'warning':
        return (
          <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Warning
          </Badge>
        );
      case 'fail':
        return (
          <Badge className="bg-red-100 text-red-800 border-red-300">
            <XCircle className="h-3 w-3 mr-1" />
            Insufficient
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Info className="h-5 w-5 text-blue-600" />
            Print Quality Check
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Banner Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-2">Banner Specifications</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-blue-700">Dimensions:</span>{' '}
                <span className="font-medium">{bannerWidthIn}″ × {bannerHeightIn}″</span>
              </div>
              <div>
                <span className="text-blue-700">Target DPI:</span>{' '}
                <span className="font-medium">{targetDpi}</span>
              </div>
              <div>
                <span className="text-blue-700">Target Pixels:</span>{' '}
                <span className="font-medium">
                  {Math.round(bannerWidthIn * targetDpi)} × {Math.round(bannerHeightIn * targetDpi)}
                </span>
              </div>
              <div>
                <span className="text-blue-700">Color Space:</span>{' '}
                <span className="font-medium">sRGB</span>
              </div>
            </div>
          </div>

          {/* Assets Quality */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">Asset Quality Analysis</h3>
            <div className="space-y-3">
              {assets.map((asset, index) => (
                <div
                  key={index}
                  className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-medium text-gray-900">{asset.name}</h4>
                    {getStatusBadge(asset.status)}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-sm text-gray-600 mb-2">
                    <div>
                      <span className="text-gray-500">Dimensions:</span>{' '}
                      <span className="font-medium">{asset.widthPx} × {asset.heightPx} px</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Effective DPI:</span>{' '}
                      <span className="font-medium">{Math.round(asset.effectiveDPI)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Color Space:</span>{' '}
                      <span className="font-medium">{asset.colorSpace}</span>
                    </div>
                  </div>
                  
                  <p className="text-sm text-gray-600">{asset.message}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Quality Guidelines */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-3">Quality Guidelines</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="font-medium text-green-900">Excellent (≥150 DPI):</span>{' '}
                  <span className="text-gray-600">Professional print quality, crisp details</span>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="font-medium text-green-800">Acceptable (≥100 DPI):</span>{' '}
                  <span className="text-gray-600">Good print quality for most applications</span>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="font-medium text-yellow-900">Warning (80-100 DPI):</span>{' '}
                  <span className="text-gray-600">May show pixelation at close viewing</span>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <XCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="font-medium text-red-900">Insufficient (&lt;80 DPI):</span>{' '}
                  <span className="text-gray-600">Not recommended for print</span>
                </div>
              </div>
            </div>
          </div>

          {/* Note */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-800">
              <Info className="h-4 w-4 inline mr-1" />
              <strong>Note:</strong> These calculations are based on the target DPI and banner dimensions.
              Actual print quality may vary based on viewing distance and material.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
