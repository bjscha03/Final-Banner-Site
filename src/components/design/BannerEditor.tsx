
        {/* Canvas Container */}
        <div className="flex-1 flex items-center justify-center p-8 overflow-auto">
          <div 
            className="relative bg-white shadow-lg"
            style={{
              transform: `scale(${previewScale / 100})`,
              transformOrigin: 'center center'
            }}
          >
            {/* Canvas with Interactive Layer */}
            <div className="relative">
              <BannerCanvas
                widthPx={widthPx}
                heightPx={heightPx}
                image={image}
                onImageUpdate={setImage}
                isDragging={isDragging}
                isResizing={isResizing}
                onDragStart={setIsDragging}
                onResizeStart={setIsResizing}
              />
              
              {/* Guides Overlay */}
              <svg
                className="absolute inset-0 pointer-events-none"
                width={widthPx}
                height={heightPx}
                viewBox={`0 0 ${widthPx} ${heightPx}`}
                style={{
                  width: `${widthPx / 2}px`,
                  height: `${heightPx / 2}px`
                }}
              >
                {/* Bleed guide - red dashed */}
                <rect
                  x={bleedRect.x}
                  y={bleedRect.y}
                  width={bleedRect.width}
                  height={bleedRect.height}
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="2"
                  strokeDasharray="10 10"
                  opacity="0.8"
                />
                
                {/* Safe area guide - green dashed */}
                <rect
                  x={safeRect.x}
                  y={safeRect.y}
                  width={safeRect.width}
                  height={safeRect.height}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="2"
                  strokeDasharray="5 5"
                  opacity="0.7"
                />
                
                {/* Trim area - solid blue */}
                <rect
                  x={trimRect.x}
                  y={trimRect.y}
                  width={trimRect.width}
                  height={trimRect.height}
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="2"
                />
                
                {/* Dimension labels */}
                <text
                  x={widthPx / 2}
                  y={-20}
                  textAnchor="middle"
                  fontSize="24"
                  fill="#374151"
                  fontWeight="600"
                >
                  {banner.widthIn}"
                </text>
                
                <text
                  x={-30}
                  y={heightPx / 2}
                  textAnchor="middle"
                  fontSize="24"
                  fill="#374151"
                  fontWeight="600"
                  transform={`rotate(-90, -30, ${heightPx / 2})`}
                >
                  {banner.heightIn}"
                </text>
                
                {/* Grommet markers */}
                {calculateGrommetPositions().map((pos, index) => (
                  <circle
                    key={index}
                    cx={pos.x}
                    cy={pos.y}
                    r="8"
                    fill="none"
                    stroke="#6b7280"
                    strokeWidth="2"
                  />
                ))}
              </svg>
            </div>
            
            {/* Loading overlay */}
            {loading && (
              <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                  <div className="text-sm text-gray-600">Loading image...</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Preview Scale Control */}
        <div className="bg-white border-t border-gray-200 p-4">
          <div className="flex items-center justify-center gap-4">
            <span className="text-sm font-medium text-gray-700">Preview Scale:</span>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">25%</span>
              <Slider
                value={[previewScale]}
                onValueChange={([value]) => setPreviewScale(value)}
                min={25}
                max={200}
                step={5}
                className="w-48"
              />
              <span className="text-sm text-gray-500">200%</span>
              <span className="text-sm font-medium text-blue-600 min-w-[50px]">
                {previewScale}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Controls */}
      <div className="w-80 bg-white border-l border-gray-200 p-6 overflow-y-auto">
        <div className="space-y-6">
          {/* Banner Size */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Banner Size</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Width (inches)
                </label>
                <input
                  type="number"
                  value={banner.widthIn}
                  onChange={(e) => onBannerSizeChange({ widthIn: Number(e.target.value) || 1 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  min="1"
                  max="120"
                  step="0.1"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Height (inches)
                </label>
                <input
                  type="number"
                  value={banner.heightIn}
                  onChange={(e) => onBannerSizeChange({ heightIn: Number(e.target.value) || 1 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  min="1"
                  max="120"
                  step="0.1"
                />
              </div>
            </div>
          </div>

          {/* Bleed & Safe */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Margins</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Bleed (inches)
                </label>
                <input
                  type="number"
                  value={banner.bleedIn}
                  onChange={(e) => setBanner(prev => ({ ...prev, bleedIn: Number(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  min="0"
                  max="2"
                  step="0.125"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Safe (inches)
                </label>
                <input
                  type="number"
                  value={banner.safeIn}
                  onChange={(e) => setBanner(prev => ({ ...prev, safeIn: Number(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  min="0"
                  max="2"
                  step="0.125"
                />
              </div>
            </div>
          </div>

          {/* Grommet Mode */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Grommets</h3>
            <select
              value={banner.grommetMode}
              onChange={(e) => setBanner(prev => ({ 
                ...prev, 
                grommetMode: e.target.value as BannerState['grommetMode']
              }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="none">None</option>
              <option value="4-corners">4 Corners</option>
              <option value="every-2ft">Every 2 ft</option>
              <option value="every-1ft">Every 1 ft</option>
            </select>
          </div>

          {/* Export Settings */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Export</h3>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Export DPI
              </label>
              <select
                value={exportDpi}
                onChange={(e) => setExportDpi(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value={150}>150 DPI</option>
                <option value={300}>300 DPI</option>
                <option value={600}>600 DPI</option>
              </select>
            </div>
          </div>

          {/* Image Controls */}
          {image && (
            <>
              <div className="border-t border-gray-200 pt-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Image</h3>
                
                {/* Fit Mode */}
                <div className="mb-4">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Fit Mode
                  </label>
                  <select
                    value={image.fitMode}
                    onChange={(e) => {
                      const newFitMode = e.target.value as ImageState['fitMode'];
                      if (image.url) {
                        const img = new Image();
                        img.onload = () => {
                          const newImageState = applyInitialFit(img, newFitMode);
                          setImage(newImageState);
                        };
                        img.src = image.url;
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  >
                    <option value="COVER">Cover</option>
                    <option value="CONTAIN">Contain</option>
                    <option value="STRETCH">Stretch</option>
                  </select>
                </div>

                {/* Position & Scale */}
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        X (px)
                      </label>
                      <input
                        type="number"
                        value={Math.round(image.x)}
                        onChange={(e) => {
                          const newX = Number(e.target.value) || 0;
                          const clamped = clampPan(newX, image.y, image.naturalW, image.naturalH, 
                            image.scaleX, image.scaleY, widthPx, heightPx, image.fitMode);
                          setImage(prev => prev ? { ...prev, x: clamped.x } : null);
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Y (px)
                      </label>
                      <input
                        type="number"
                        value={Math.round(image.y)}
                        onChange={(e) => {
                          const newY = Number(e.target.value) || 0;
                          const clamped = clampPan(image.x, newY, image.naturalW, image.naturalH, 
                            image.scaleX, image.scaleY, widthPx, heightPx, image.fitMode);
                          setImage(prev => prev ? { ...prev, y: clamped.y } : null);
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Scale (%)
                    </label>
                    <input
                      type="number"
                      value={Math.round(image.scaleX * 100)}
                      onChange={(e) => {
                        const newScale = (Number(e.target.value) || 100) / 100;
                        const clampedScale = Math.max(image.minScaleForFit, newScale);
                        setImage(prev => prev ? { 
                          ...prev, 
                          scaleX: clampedScale, 
                          scaleY: clampedScale 
                        } : null);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                      min={Math.round(image.minScaleForFit * 100)}
                      step="1"
                    />
                  </div>
                </div>

                {/* Auto Refit */}
                <div className="mt-4">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={autoRefit}
                      onChange={(e) => setAutoRefit(e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-xs text-gray-700">
                      Auto re-fit on size change
                    </span>
                  </label>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            handleFileUpload(file);
          }
        }}
        className="hidden"
      />
    </div>
  );
};

export default BannerEditor;
