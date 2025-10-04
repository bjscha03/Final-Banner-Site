#!/usr/bin/env python3

import re

# Read the file
with open('src/components/design/PreviewCanvas.tsx', 'r') as f:
    content = f.read()

# 1. Add isRenderingPdf to interface
content = content.replace(
    'isUploading?: boolean;\n}',
    'isUploading?: boolean;\n  isRenderingPdf?: boolean;\n}'
)

# 2. Add isRenderingPdf parameter
content = content.replace(
    'isUploading = false,}) => {',
    'isUploading = false,\n  isRenderingPdf = false,}) => {'
)

# 3. Add PDF rendering spinner after existing spinner
spinner_code = '''        {/* PDF Rendering Spinner Overlay */}
        {isRenderingPdf && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-50 rounded-2xl">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 text-purple-600 animate-spin" />
              <p className="text-sm font-medium text-purple-700">Rendering PDF...</p>
            </div>
          </div>
        )}'''

content = content.replace(
    '              <p className="text-sm font-medium text-blue-700">Processing file...</p>\n            </div>\n          </div>\n        )}',
    '              <p className="text-sm font-medium text-blue-700">Processing file...</p>\n            </div>\n          </div>\n        )}\n' + spinner_code
)

# 4. Remove PDF overlay section
pdf_overlay_pattern = r'\s*{/\* PDF Preview Overlay \*/}.*?}\s*\)\s*}\s*</div>'
content = re.sub(pdf_overlay_pattern, '', content, flags=re.DOTALL)

# 5. Update image rendering conditions
content = content.replace('imageUrl && !file?.isPdf &&', 'imageUrl &&')
content = content.replace('!imageUrl && !file?.isPdf &&', '!imageUrl &&')

# Write the file back
with open('src/components/design/PreviewCanvas.tsx', 'w') as f:
    f.write(content)

print("PreviewCanvas.tsx updated successfully")
