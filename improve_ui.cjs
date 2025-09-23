const fs = require('fs');

// Read the file
let content = fs.readFileSync('src/components/design/LivePreviewCard.tsx', 'utf8');

// First, add Upload icon import if not already present
if (!content.includes('Upload,')) {
  content = content.replace(
    'import { Eye, ZoomIn, ZoomOut, Upload, FileText, Image, X, ChevronDown, ChevronUp, Wand2, Crop } from \'lucide-react\';',
    'import { Eye, ZoomIn, ZoomOut, Upload, FileText, Image, X, ChevronDown, ChevronUp, Wand2, Crop } from \'lucide-react\';'
  );
}

// Replace the upload button section
const oldUploadSection = `              <button
                onClick={() => fileInputRef.current?.click()}
                className="mb-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200 w-full max-w-xs"
              >
                Upload Artwork
              </button>
              {import.meta.env.VITE_AI_BANNER_ENABLED !== 'false' && onOpenAIModal && (
                <>
                  <div className="text-gray-400 text-sm mb-2">or</div>
                  <button
                    onClick={onOpenAIModal}
                    className="mb-4 px-6 py-2 border border-purple-600 text-purple-600 hover:bg-purple-50 rounded-lg font-medium transition-colors duration-200 w-full max-w-xs flex items-center justify-center gap-2"
                    data-cta="ai-generate-open"
                  >
                    <Wand2 className="w-4 h-4" />
                    Generate with AI
                  </button>
                </>
              )}`;

const newUploadSection = `              <button
                onClick={() => fileInputRef.current?.click()}
                className="mb-3 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200 w-full max-w-xs h-12 flex items-center justify-center gap-2 shadow-sm hover:shadow-md"
              >
                <Upload className="w-5 h-5" />
                Upload Artwork
              </button>
              {import.meta.env.VITE_AI_BANNER_ENABLED !== 'false' && onOpenAIModal && (
                <>
                  <div className="text-gray-400 text-sm mb-3">or</div>
                  <button
                    onClick={onOpenAIModal}
                    className="mb-4 px-6 py-3 relative bg-gradient-to-r from-purple-50 to-blue-50 border-2 border-purple-300 hover:border-purple-400 hover:from-purple-100 hover:to-blue-100 text-purple-700 hover:text-purple-800 rounded-lg font-medium transition-all duration-200 w-full max-w-xs h-12 flex items-center justify-center gap-2 shadow-sm hover:shadow-md"
                    data-cta="ai-generate-open"
                  >
                    <Wand2 className="w-5 h-5" />
                    Generate with AI
                    <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full shadow-sm">
                      BETA
                    </span>
                  </button>
                </>
              )}`;

content = content.replace(oldUploadSection, newUploadSection);

// Write the file back
fs.writeFileSync('src/components/design/LivePreviewCard.tsx', content);
console.log('UI improvements applied successfully!');
