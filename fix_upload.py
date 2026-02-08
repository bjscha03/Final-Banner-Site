import re

with open('src/components/design/editor/AssetsPanel.tsx', 'r') as f:
    content = f.read()

with open('src/components/design/editor/AssetsPanel.tsx.backup', 'w') as f:
    f.write(content)

# Update imports
content = content.replace(
    "import { Upload, X, Image as ImageIcon, Plus } from 'lucide-react';",
    "import { Upload, X, Image as ImageIcon, Plus, AlertCircle, RefreshCw, Loader2 } from 'lucide-react';"
)

# Add UploadError interface
upload_error = "\n\ninterface UploadError {\n  message: string;\n  fileName: string;\n  canRetry: boolean;\n  retryFile?: File;\n}"
if 'interface UploadError' not in content:
    content = re.sub(r'(interface UploadedImage \{[^}]+\})', r'\1' + upload_error, content)

# Add uploadError state
if 'uploadError' not in content:
    content = content.replace(
        'const [uploading, setUploading] = useState(false);',
        'const [uploading, setUploading] = useState(false);\n  const [uploadError, setUploadError] = useState<UploadError | null>(null);'
    )

wiwiwiwiwi'srwiwiwiwiwi'srwiwiwiwiwi'srwiwiwiwiwi'srwiwiwiwiwi'srwiwiwiwiwi'srwi(cwiwiwiwiwi'srwiwiwiwi 1 complete")
