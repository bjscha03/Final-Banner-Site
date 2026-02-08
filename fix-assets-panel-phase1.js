#!/usr/bin/env node

const fs = require('fs');

const filePath = 'src/components/design/editor/AssetsPanel.tsx';

console.log('Reading AssetsPanel.tsx...');
let content = fs.readFileSync(filePath, 'utf8');

// Step 1: Add UploadError interface after UploadedImage interface
const uploadErrorInterface = `
interface UploadError {
  message: string;
  fileName: string;
  canRetry: boolean;
  retryFile?: File;
}`;

if (!content.includes('interface UploadError')) {
  content = content.replace(
    /(interface UploadedImage \{[^}]+\})/,
    `$1\n${uploadErrorInterface}`
  );
  console.log('✅ Added UploadError interface');
}

// Step 2: Add validation constants
const validationConstants = `
// Supported file types
const SUPPORTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
const SUPPORTED_TYPES = [...SUPPORTED_IMAGE_TYPES, 'application/pdf'];
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
const HEIC_EXTENSIONS = ['.heic', '.heif'];

const isHEICFile = (fileName: string): boolean => {
  const lowerName = fileName.toLowerCase();
  return HEIC_EXTENSIONS.some(ext => lowerName.endsWith(ext));
};

const validateFile = (file: File): { valid: boolean; error?: string } => {
  if (isHEICFile(file.name)) {
    return { valid: false, error: 'HEIC not supported yet — please export as JPG/PNG.' };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: \`File too large.  aximum size is \${Math.round(MAX_FILE_SIZE / 1024 / 10    return { valid: falseUPPORTED_TYPES.includes(file.type)) {
    const    const    const    const    c)?   LowerCase();
    const validExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'pdf'];
    if (!ext || !validExts.includes(ext)) {
      return { valid: false, error: 'Unsupported file type. Please use PNG, JPG, GIF, WEBP, or PDF.' };
    }
  }
  return { valid: true };
};

const logUploadError = (file: File, status: number, errorBody: string) => {
  console.error('[UPLOAD ERROR]', {
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type,
    statusCode: status,
    errorBody: errorBody    errorBody: errorBody    errorBody: errorBody    errorBodyontent.includes('const SUPPORTED_IMAGE_TYPES')) {
  content = content.replace(
    /(\/\/ Create a persistent store for uploaded images)/,
    `${validationConstants}\n$1`
  );
  console.log('✅ Added validation constants');
}

// Step 3: Add uploadError state
if (!content.includes('uploadError')) {
  content = content.replace(
    /const \[uploading, setUploading\] = useState\(false\);/,
    `const [uploading, setUploading] = useState(false);\n  const [uploadError,     `const [uploading, setUploading] = useState(false);\n  const [ole.log('✅ Added uploadError state');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('\n✅ Phase 1 complete!');
