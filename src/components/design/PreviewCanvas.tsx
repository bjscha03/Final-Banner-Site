{/* Professional Print Guidelines */}
        
        {/* Dimension Rulers - Only show when showDimensions is true */}
        {showDimensions && (
          <g className="print-rulers">
            {/* Top ruler */}
            <rect x="0" y="0" width={totalWidth} height={RULER_HEIGHT} fill="#f8f9fa" stroke="#e5e7eb" strokeWidth="0.01"/>
            <text x={totalWidth/2} y={RULER_HEIGHT/2} textAnchor="middle" dominantBaseline="middle" fontSize="0.12" fill="#6b7280">
              {`${widthIn}"`}
            </text>
            
            {/* Bottom ruler */}
            <rect x="0" y={totalHeight - RULER_HEIGHT} width={totalWidth} height={RULER_HEIGHT} fill="#f8f9fa" stroke="#e5e7eb" strokeWidth="0.01"/>
            <text x={totalWidth/2} y={totalHeight - RULER_HEIGHT/2} textAnchor="middle" dominantBaseline="middle" fontSize="0.12" fill="#6b7280">
              {`${widthIn}"`}
            </text>
            
            {/* Left ruler */}
            <rect x="0" y="0" width={RULER_HEIGHT} height={totalHeight} fill="#f8f9fa" stroke="#e5e7eb" strokeWidth="0.01"/>
            <text x={RULER_HEIGHT/2} y={totalHeight/2} textAnchor="middle" dominantBaseline="middle" fontSize="0.12" fill="#6b7280" transform={`rotate(-90, ${RULER_HEIGHT/2}, ${totalHeight/2})`}>
              {`${heightIn}"`}
            </text>
            
            {/* Right ruler */}
            <rect x={totalWidth - RULER_HEIGHT} y="0" width={RULER_HEIGHT} height={totalHeight} fill="#f8f9fa" stroke="#e5e7eb" strokeWidth="0.01"/>
            <text x={totalWidth - RULER_HEIGHT/2} y={totalHeight/2} textAnchor="middle" dominantBaseline="middle" fontSize="0.12" fill="#6b7280" transform={`rotate(90, ${totalWidth - RULER_HEIGHT/2}, ${totalHeight/2})`}>
              {`${heightIn}"`}
            </text>
          </g>
        )}

        {/* Bleed Area - Only show when showBleedArea is true */}
        {showBleedArea && showDimensions && (
          <rect
            x={RULER_HEIGHT}
            y={RULER_HEIGHT}
            width={bleedWidth}
            height={bleedHeight}
            fill="none"
            stroke="#ef4444"
            strokeWidth="0.02"
            strokeDasharray="0.05 0.05"
            opacity="0.6"
          />
        )}

        {/* Banner background - positioned with offset when rulers are shown */}
        <rect
          x={showDimensions ? bannerOffsetX : 0}
          y={showDimensions ? bannerOffsetY : 0}
          width={widthIn}
          height={heightIn}
          fill="white"
          stroke="#e5e7eb"
          strokeWidth="0.1"
          rx="0.5"
          ry="0.5"
        />

        {/* Safety Area - Only show when showSafetyArea is true */}
        {showSafetyArea && (
          <rect
            x={(showDimensions ? bannerOffsetX : 0) + SAFETY_MARGIN}
            y={(showDimensions ? bannerOffsetY : 0) + SAFETY_MARGIN}
            width={widthIn - (SAFETY_MARGIN * 2)}
            height={heightIn - (SAFETY_MARGIN * 2)}
            fill="none"
            stroke="#3b82f6"
            strokeWidth="0.02"
            strokeDasharray="0.1 0.1"
            opacity="0.7"
          />
        )}

        {/* Clip path for image - updated for offset positioning */}
        <defs>
          <clipPath id="banner-clip">
            <rect
              x={(showDimensions ? bannerOffsetX : 0) + 0.5}
              y={(showDimensions ? bannerOffsetY : 0) + 0.5}
              width={widthIn - 1}
              height={heightIn - 1}
              rx="0.5"
              ry="0.5"
            />
          </clipPath>
        </defs>

        {/* Image if provided - updated positioning */}
        {imageUrl && !file?.isPdf && (
          <image key={imageUrl}
            href={imageUrl}
            x={(showDimensions ? bannerOffsetX : 0) + 0.5 + (imagePosition.x * 0.01)}
            y={(showDimensions ? bannerOffsetY : 0) + 0.5 + (imagePosition.y * 0.01)}
            width={widthIn - 1}
            height={heightIn - 1}
            preserveAspectRatio="xMidYMid slice"
            clipPath="url(#banner-clip)"
            style={{
              cursor: isDraggingImage ? 'grabbing' : 'grab',
              userSelect: 'none'
            }}
            onMouseDown={onImageMouseDown}
            onTouchStart={onImageTouchStart}
          />
        )}

        {/* PDF preview - updated positioning */}
        {file?.isPdf && FEATURE_PDF_STATIC_PREVIEW && (
          <foreignObject
            x={(showDimensions ? bannerOffsetX : 0) + 0.5}
            y={(showDimensions ? bannerOffsetY : 0) + 0.5}
            width={widthIn - 1}
            height={heightIn - 1}
          >
            <PdfImagePreview
              pdfUrl={file.url || ''}
              width={(widthIn - 1) * 72}
              height={(heightIn - 1) * 72}
              scale={scale}
            />
          </foreignObject>
        )}

        {/* Legacy PDF preview fallback - updated positioning */}
        {file?.isPdf && !FEATURE_PDF_STATIC_PREVIEW && (
          <foreignObject
            x={(showDimensions ? bannerOffsetX : 0) + 0.5}
            y={(showDimensions ? bannerOffsetY : 0) + 0.5}
            width={widthIn - 1}
            height={heightIn - 1}
          >
            <PDFPreview pdfUrl={file.url || ''} />
          </foreignObject>
        )}

        {/* Grommets - updated positioning */}
        {grommets !== 'none' && (
          <g className="grommets">
            {grommetPositions.map((pos, i) => (
              <circle
                key={i}
                cx={(showDimensions ? bannerOffsetX : 0) + pos.x}
                cy={(showDimensions ? bannerOffsetY : 0) + pos.y}
                r="0.125"
                fill="#9ca3af"
                stroke="#6b7280"
                strokeWidth="0.02"
              />
            ))}
          </g>
        )}

        {/* Upload prompt - updated positioning */}
        {!imageUrl && !file?.isPdf && (
          <g className="upload-prompt">
            <rect
              x={(showDimensions ? bannerOffsetX : 0) + widthIn/2 - 2}
              y={(showDimensions ? bannerOffsetY : 0) + heightIn/2 - 1}
              width="4"
              height="2"
              fill="#f3f4f6"
              stroke="#d1d5db"
              strokeWidth="0.05"
              rx="0.2"
            />
            <foreignObject
              x={(showDimensions ? bannerOffsetX : 0) + widthIn/2 - 2}
              y={(showDimensions ? bannerOffsetY : 0) + heightIn/2 - 1}
              width="4"
              height="2"
            >
              <div className="flex flex-col items-center justify-center h-full text-gray-500">
                <Image className="w-8 h-8 mb-2" />
                <span className="text-sm font-medium">Upload Artwork</span>
                <span className="text-xs">or generate with AI</span>
              </div>
            </foreignObject>
          </g>
        )}
        </svg>

      {/* PDF Preview Overlay */}
      {file?.isPdf && file.url && (
        <div className="absolute inset-0 flex items-center justify-center p-4">
          {FEATURE_PDF_STATIC_PREVIEW ? (
            <PdfImagePreview
              fileUrl={file.url}
              fileName={file.name}
              className="w-full h-full max-w-md max-h-80 object-contain"
              onError={(e) => console.error('PDF preview error:', e)}
            />
          ) : (
            <PDFPreview
              url={file.url}
              className="w-full h-full max-w-md max-h-80"
            />
          )}
        </div>
      )}
      </div>

    {/* Professional info panel below the preview with more spacing */}
    <div className="mt-8 bg-gradient-to-r from-gray-50 to-white rounded-xl border border-gray-200 p-5 shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center gap-4 w-full">
        {/* Banner dimensions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-sm text-gray-600 font-medium">Size:</span>
          <span className="text-sm font-bold text-gray-900 bg-blue-100 px-2 py-1 rounded-md whitespace-nowrap">
            {widthIn}″ × {heightIn}″
          </span>
        </div>

        {/* Grommet info */}
        {grommetPositions.length > 0 && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-sm text-gray-600 font-medium">Grommets:</span>
            <span className="text-sm font-bold text-gray-900 bg-green-100 px-2 py-1 rounded-md whitespace-nowrap">
              {grommetPositions.length} total
            </span>
          </div>
        )}

        {/* File info - constrained width */}
        {file && (
          <div className="flex items-center gap-2 min-w-0 max-w-xs">
            <div className="flex items-center gap-1 flex-shrink-0">
              {file.isPdf ? (
                <FileText className="h-4 w-4 text-red-500" />
              ) : (
                <Image className="h-4 w-4 text-blue-500" />
              )}
              <span className="text-sm text-gray-600 font-medium">File:</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-gray-900 truncate max-w-[120px]" title={file.name}>
                {file.name}
              </div>
              <div className="text-xs text-gray-500 truncate max-w-[120px]">
                {file.type.split('/')[1].toUpperCase()} • {formatFileSize(file.size)}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  </div>
  );
};

export default PreviewCanvas;
