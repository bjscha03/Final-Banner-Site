#!/bin/bash

# Add isRenderingPdf prop to interface
sed -i '' 's/isUploading?: boolean;/isUploading?: boolean;\
  isRenderingPdf?: boolean;/' src/components/design/PreviewCanvas.tsx

# Add isRenderingPdf parameter to function
sed -i '' 's/isUploading = false,}) => {/isUploading = false,\
  isRenderingPdf = false,}) => {/' src/components/design/PreviewCanvas.tsx

# Add PDF rendering spinner after existing spinner
sed -i '' '/Processing file.../a\
        {/* PDF Rendering Spinner Overlay */}\
        {isRenderingPdf && (\
          <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-50 rounded-2xl">\
            <div className="flex flex-col items-center gap-3">\
              <Loader2 className="h-8 w-8 text-purple-600 animate-spin" />\
              <p className="text-sm font-medium text-purple-700">Rendering PDF...</p>\
            </div>\
          </div>\
        )}' src/components/design/PreviewCanvas.tsx

# Remove PDF overlay section
sed -i '' '/PDF Preview Overlay/,/^      })/d' src/components/design/PreviewCanvas.tsx

# Update image rendering conditions
sed -i '' 's/imageUrl && !file?.isPdf &&/imageUrl &&/g' src/components/design/PreviewCanvas.tsx
sed -i '' 's/!imageUrl && !file?.isPdf &&/!imageUrl &&/g' src/components/design/PreviewCanvas.tsx

echo "PreviewCanvas.tsx updated successfully"
