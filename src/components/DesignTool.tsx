import React, { useState, useEffect } from 'react';
import { Upload, Eye, ShoppingCart, Ruler, Palette } from 'lucide-react';

const DesignTool: React.FC = () => {
  const [width, setWidth] = useState<string>('4');
  const [height, setHeight] = useState<string>('2');
  const [quantity, setQuantity] = useState<string>('1');
  const [material, setMaterial] = useState<string>('15oz');
  const [grommets, setGrommets] = useState<string>('corners');
  const [polePockets, setPolePockets] = useState<boolean>(false);
  const [rope, setRope] = useState<boolean>(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string | null>(null); // New state for the S3 URL

  const materialPrices = {
    '13oz': 4.50,
    '15oz': 6.00,
    '18oz': 7.50,
    'mesh': 6.00
  };

  const [totalPrice, setTotalPrice] = useState<number>(0);

  useEffect(() => {
    const w = parseFloat(width) || 0;
    const h = parseFloat(height) || 0;
    const q = parseInt(quantity) || 1;
    const materialPrice = materialPrices[material as keyof typeof materialPrices];
    
    let price = w * h * materialPrice * q;
    
    if (polePockets) price += w * 0.50 * q;
    if (rope) price += w * 2.00 * q;
    
    setTotalPrice(price);
  }, [width, height, quantity, material, polePockets, rope]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      const clientSideUrl = URL.createObjectURL(file);
      setPreviewUrl(clientSideUrl); // Show client-side preview immediately
      setUploadedFileUrl(null); // Reset S3 URL on new upload

      // Upload file to Netlify function
      console.log('🔍 DesignTool - Current hostname:', window.location.hostname);
      
      // ALWAYS use mock upload in development - NO NETWORK CALLS
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        console.log('✅ DEVELOPMENT MODE: DesignTool using mock upload - NO SERVER CALL');
        
        // Simulate upload delay
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const mockResult = {
          success: true,
          filename: file.name,
          size: file.size,
          fileKey: `dev-uploads/${Date.now()}-${file.name}`,
          fileUrl: previewUrl
        };

        if (mockResult.success && mockResult.fileUrl) {
          setUploadedFileUrl(mockResult.fileUrl);
          setPreviewUrl(mockResult.fileUrl);
          console.log("✅ DesignTool mock upload completed - NO SERVER INVOLVED:", mockResult.fileUrl);
        }
        return; // CRITICAL: Exit here, no server call
      }

      // Production code (only runs when NOT on localhost)
      console.log('🚀 PRODUCTION MODE: DesignTool using real upload');
      const formData = new FormData();
      formData.append("file", file);

      try {
        const response = await fetch("/.netlify/functions/upload-file", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`Upload failed: ${response.statusText}`);
        }

        const result = await response.json();
        if (result.success && result.fileUrl) {
          setUploadedFileUrl(result.fileUrl);
          setPreviewUrl(result.fileUrl);
          console.log("File uploaded successfully:", result.fileUrl);
        } else {
          throw new Error(result.error || "Unknown upload error");
        }
      } catch (error) {
        console.error("Error uploading file:", error);
        setUploadedFile(null);
        setPreviewUrl('');
        setUploadedFileUrl(null);
        alert("Failed to upload file. Please try again.");
      }
    }
  };

  // This function would be called when the "Add to Cart" button is clicked
  const handleAddToCart = () => {
    if (!uploadedFileUrl) {
      alert("Please upload your artwork before adding to cart.");
      return;
    }

    const item = {
      width_in: parseFloat(width) * 12, // Assuming width is in feet, convert to inches
      height_in: parseFloat(height) * 12, // Assuming height is in feet, convert to inches
      quantity: parseInt(quantity),
      material: material,
      grommets: grommets,
      rope_feet: rope ? (parseFloat(width) * 2 + parseFloat(height) * 2) : 0, // Example calculation
      pole_pockets: polePockets,
      line_total_cents: Math.round(totalPrice * 100),
      file_key: uploadedFileUrl, // Pass the S3 URL as file_key
      file_name: uploadedFile?.name || 'untitled',
    };
    
    console.log("Adding to cart:", item);
    // Here you would typically dispatch an action to add the item to a global cart state
    // or send it to a cart API.
    alert("Item added to cart! (Check console for details)");
  };

  return (
    <section className="py-16 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <div className="flex items-center justify-center space-x-2 mb-4">
            <Palette className="h-6 w-6 text-orange-500" />
            <h2 className="text-3xl font-bold text-gray-900">Banner Design Tool</h2>
          </div>
          <p className="text-lg text-gray-600">Design your custom banner with live preview</p>
        </div>

        <div className="grid lg:grid-cols-2 gap-12">
          {/* Left Column - Configuration */}
          <div className="bg-white rounded-xl shadow-lg p-8">
            <h3 className="text-xl font-semibold text-gray-900 mb-6">Banner Configuration</h3>
            
            <div className="space-y-6">
              {/* Dimensions */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  <Ruler className="inline h-4 w-4 mr-2" />
                  Banner Size
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Width (ft)</label>
                    <input
                      type="number"
                      value={width}
                      onChange={(e) => setWidth(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      min="1"
                      step="0.5"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Height (ft)</label>
                    <input
                      type="number"
                      value={height}
                      onChange={(e) => setHeight(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      min="1"
                      step="0.5"
                    />
                  </div>
                </div>
              </div>

              {/* Material & Quantity */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Material</label>
                  <select
                    value={material}
                    onChange={(e) => setMaterial(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="13oz">13oz Vinyl</option>
                    <option value="15oz">15oz Vinyl</option>
                    <option value="18oz">18oz Vinyl</option>
                    <option value="mesh">Mesh Fence</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Quantity</label>
                  <input
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    min="1"
                  />
                </div>
              </div>

              {/* Options */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">Options</label>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm text-gray-600 mb-2">Grommets</label>
                    <select
                      value={grommets}
                      onChange={(e) => setGrommets(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="none">No Grommets</option>
                      <option value="corners">Corners Only</option>
                      <option value="every2ft">Every 2 Feet</option>
                      <option value="every18in">Every 18 Inches</option>
                    </select>
                  </div>
                  
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="polePockets"
                      checked={polePockets}
                      onChange={(e) => setPolePockets(e.target.checked)}
                      className="mr-3"
                    />
                    <label htmlFor="polePockets" className="text-sm text-gray-600">
                      Pole Pockets (+$0.50/linear ft)
                    </label>
                  </div>
                  
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="rope"
                      checked={rope}
                      onChange={(e) => setRope(e.target.checked)}
                      className="mr-3"
                    />
                    <label htmlFor="rope" className="text-sm text-gray-600">
                      Rope Add-on (+$2.00/linear ft)
                    </label>
                  </div>
                </div>
              </div>

              {/* File Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  <Upload className="inline h-4 w-4 mr-2" />
                  Upload Artwork
                </label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors">
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="fileUpload"
                  />
                  <label htmlFor="fileUpload" className="cursor-pointer">
                    <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">
                      Click to upload or drag and drop
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      PDF, JPG, PNG up to 100MB
                    </p>
                  </label>
                </div>
                {uploadedFile && (
                  <p className="mt-2 text-sm text-green-600">
                    ✅ {uploadedFile.name} uploaded
                  </p>
                )}
                {uploadedFileUrl && (
                  <p className="mt-2 text-sm text-blue-600">
                    🔗 <a href={uploadedFileUrl} target="_blank" rel="noopener noreferrer">View Uploaded File</a>
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Right Column - Preview & Pricing */}
          <div className="space-y-6">
            {/* Preview */}
            <div className="bg-white rounded-xl shadow-lg p-8">
              <h3 className="text-xl font-semibold text-gray-900 mb-6 flex items-center">
                <Eye className="h-5 w-5 mr-2" />
                Live Preview
              </h3>
              <div className="bg-gray-100 rounded-lg p-6 min-h-[300px] flex items-center justify-center">
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt="Banner Preview"
                    className="max-w-full max-h-[280px] object-contain rounded shadow-lg"
                  />
                ) : (
                  <div className="text-center text-gray-500">
                    <Eye className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                    <p>Upload artwork to see preview</p>
                    <p className="text-sm mt-2">Size: {width}' × {height}'</p>
                  </div>
                )}
              </div>
            </div>

            {/* Pricing */}
            <div className="bg-white rounded-xl shadow-lg p-8">
              <h3 className="text-xl font-semibold text-gray-900 mb-6">Pricing Summary</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span>Size:</span>
                  <span>{width}' × {height}' ({(parseFloat(width) * parseFloat(height)).toFixed(1)} sq ft)</span>
                </div>
                <div className="flex justify-between">
                  <span>Material:</span>
                  <span>{material} Vinyl</span>
                </div>
                <div className="flex justify-between">
                  <span>Quantity:</span>
                  <span>{quantity}</span>
                </div>
                {polePockets && (
                  <div className="flex justify-between text-sm">
                    <span>Pole Pockets:</span>
                    <span>+${(parseFloat(width) * 0.50 * parseInt(quantity)).toFixed(2)}</span>
                  </div>
                )}
                {rope && (
                  <div className="flex justify-between text-sm">
                    <span>Rope:</span>
                    <span>+${(parseFloat(width) * 2.00 * parseInt(quantity)).toFixed(2)}</span>
                  </div>
                )}
                <div className="border-t pt-3">
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-semibold">Total:</span>
                    <span className="text-2xl font-bold text-orange-500">${totalPrice.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <button 
                onClick={handleAddToCart}
                className="w-full mt-6 bg-orange-500 hover:bg-orange-600 text-white px-6 py-3 rounded-lg font-semibold transition-colors flex items-center justify-center space-x-2"
              >
                <ShoppingCart className="h-5 w-5" />
                <span>Add to Cart</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default DesignTool;