import React, { useState, useRef } from 'react';
import { X, Upload, FileText, Image as ImageIcon, Loader2, AlertTriangle, Check, Package, Palette, Settings, ShoppingCart } from 'lucide-react';
import { useQuoteStore } from '@/store/quote';
import { useCartStore } from '@/store/cart';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import MaterialCard from './MaterialCard';
import OptionsCard from './OptionsCard';
import SizeCard from './SizeCard';
import { calcTotals } from '@/lib/pricing';

interface PrintReadyUploadPanelProps {
  open: boolean;
  onClose: () => void;
}

const PrintReadyUploadPanel: React.FC<PrintReadyUploadPanelProps> = ({ open, onClose }) => {
  const quote = useQuoteStore();
  const { addFromQuote } = useCartStore();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isAddingToCart, setIsAddingToCart] = useState(false);

  const maxSizeBytes = 10 * 1024 * 1024;

  if (!open) return null;

  const validateFile = (file: File): string | null => {
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    const validExtensions = ['pdf', 'jpg', 'jpeg', 'png', 'ai', 'psd'];
    
    if (!validExtensions.includes(fileExtension || '')) {
      return 'Please upload a PDF, JPG, PNG, AI, or PSD file.';
    }
    if (file.size > maxSizeBytes) {
      const maxMB = maxSizeBytes / (1024 * 1024);
      return 'File size must be less than ' + maxMB + 'MB.';
    }
    return null;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleFunctionUpload = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/.netlify/functions/upload-file', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Upload failed with status ' + response.status);
    }

    return await response.json();
  };

  const handleFileUpload = async (file: File) => {
    setIsUploading(true);
    setUploadError('');

    try {
      const validationError = validateFile(file);
      if (validationError) {
        setUploadError(validationError);
        return;
      }

      const result = await handleFunctionUpload(file);

      if (result.secureUrl) {
        let artworkWidth, artworkHeight;
        if (file.type.startsWith('image/')) {
          const img = new Image();
          const imgLoadPromise = new Promise((resolve) => {
            img.onload = () => {
              artworkWidth = img.naturalWidth;
              artworkHeight = img.naturalHeight;
              resolve(null);
            };
          });
          img.src = result.secureUrl;
          await imgLoadPromise;
        }

        quote.set({
          file: {
            name: file.name,
            url: result.secureUrl,
            size: file.size,
            type: file.type,
            fileKey: result.fileKey || result.publicId,
            isPdf: file.type === 'application/pdf',
            artworkWidth,
            artworkHeight,
          },
        });
        setUploadError('');
      } else {
        setUploadError(result.error || 'Upload failed. Please try again.');
      }
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileUpload(droppedFile);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      handleFileUpload(selectedFile);
    }
  };

  const removeFile = () => {
    quote.set({ file: undefined });
    setUploadError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const openFileDialog = () => {
    fileInputRef.current?.click();
  };

  const getFileIcon = (fileName: string) => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    return extension === 'pdf' ? FileText : ImageIcon;
  };

  const handleAddToCart = async () => {
    // TEMPORARY: Allow add to cart without file for testing
    // if (!quote.file) {
    //   toast({
    //     title: "File Required",
    //     description: "Please upload your print-ready file before adding to cart.",
    //     variant: "destructive",
    //   });
    //   return;
    // }

    if (!quote.widthIn || !quote.heightIn) {
      toast({
        title: "Size Required",
        description: "Please select a banner size.",
        variant: "destructive",
      });
      return;
    }

    setIsAddingToCart(true);

    try {
      const totals = calcTotals({
        widthIn: quote.widthIn,
        heightIn: quote.heightIn,
        qty: quote.quantity,
        material: quote.material,
        addRope: quote.addRope,
        polePockets: quote.polePockets
      });
      const pricing = {
        unit_price_cents: Math.round(totals.unit * 100),
        rope_cost_cents: Math.round(totals.rope * 100),
        rope_pricing_mode: 'per_item' as const,
        pole_pocket_cost_cents: Math.round(totals.polePocket * 100),
        pole_pocket_pricing_mode: 'per_item' as const,
        line_total_cents: Math.round(totals.materialTotal * 100),
      };

      addFromQuote(quote, undefined, pricing);

      toast({
        title: "Added to Cart",
        description: quote.widthIn + '" × ' + quote.heightIn + '" banner added successfully.',
      });

      onClose();
    } catch (error) {
      console.error("Add to cart error:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to add to cart. Please try again.";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsAddingToCart(false);
    }
  };

  return (
    <>
      <div 
        className="fixed inset-0 bg-black/50 z-[120] transition-opacity"
        onClick={onClose}
      />
      
      <div className="fixed inset-x-0 bottom-0 lg:inset-y-0 lg:right-0 lg:left-auto lg:w-[600px] bg-white z-[130] shadow-2xl overflow-y-auto max-h-[90vh] lg:max-h-full rounded-t-2xl lg:rounded-none">
        <div className="bg-white border-b border-gray-200 px-4 lg:px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl lg:text-2xl font-bold text-gray-900">Upload Your Finished Banner Design</h2>
            <p className="text-sm text-gray-600 mt-1">Skip the design tool — just tell us the specs and upload your file.</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Close panel"
          >
            <X className="w-6 h-6 text-gray-500" />
          </button>
        </div>

        <div className="p-4 lg:p-6 space-y-6">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                <Package className="w-4 h-4 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Step 1 — Choose Size</h3>
            </div>
            <SizeCard />
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                <Palette className="w-4 h-4 text-purple-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Step 2 — Choose Material</h3>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <MaterialCard />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center">
                <Settings className="w-4 h-4 text-orange-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Step 3 — Finishing Options</h3>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <OptionsCard />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                <Upload className="w-4 h-4 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Step 4 — Upload Your File</h3>
            </div>
            
            {!quote.file ? (
              <div
                className={'border-2 border-dashed rounded-lg p-8 text-center transition-colors ' + (dragActive ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-gray-400')}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.ai,.psd"
                  onChange={handleFileSelect}
                  className="hidden"
                  disabled={isUploading}
                />
                
                {isUploading ? (
                  <div className="flex flex-col items-center">
                    <Loader2 className="h-12 w-12 text-blue-500 animate-spin mb-4" />
                    <p className="text-gray-600">Uploading your file...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <Upload className="h-12 w-12 text-gray-400 mb-4" />
                    <p className="text-lg font-medium text-gray-900 mb-2">
                      Upload your final banner design
                    </p>
                    <p className="text-sm text-gray-500 mb-4">
                      PDF, JPG, PNG, AI, PSD accepted
                    </p>
                    <Button type="button" onClick={openFileDialog} disabled={isUploading}>
                      Choose File
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="border border-gray-200 rounded-lg p-4 bg-green-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    {React.createElement(getFileIcon(quote.file.name), {
                      className: "h-8 w-8 text-green-600"
                    })}
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900">{quote.file.name}</p>
                        <Check className="w-4 h-4 text-green-600" />
                      </div>
                      <p className="text-sm text-gray-500">
                        {formatFileSize(quote.file.size)}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={removeFile}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                  >
                    <X className="h-4 w-4 mr-1" />
                    Remove
                  </Button>
                </div>
              </div>
            )}

            {uploadError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-800">{uploadError}</p>
              </div>
            )}
          </div>

          <div className="sticky bottom-0 bg-white border-t border-gray-200 pt-4 -mx-4 lg:-mx-6 px-4 lg:px-6 pb-4">
            <Button
              onClick={handleAddToCart}
              disabled={!quote.file || isAddingToCart}
              className="w-full min-h-[48px] bg-gradient-to-r from-[#18448D] to-indigo-600 hover:from-[#0f2d5c] hover:to-indigo-700 text-white font-semibold text-base"
            >
              {isAddingToCart ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Adding to Cart...
                </>
              ) : (
                <>
                  <ShoppingCart className="w-5 h-5 mr-2" />
                  Add Banner to Cart
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
};

export default PrintReadyUploadPanel;
