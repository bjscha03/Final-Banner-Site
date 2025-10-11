import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export interface UploadOptions {
  folder?: string;
  public_id?: string;
  transformation?: any;
}

export async function uploadBufferToCloudinary(
  buffer: Buffer,
  options: UploadOptions = {}
): Promise<{ url: string; publicId: string }> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: options.folder || 'ai-generated-banners',
        public_id: options.public_id,
        resource_type: 'image',
        ...options.transformation,
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else if (result) {
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
          });
        } else {
          reject(new Error('Upload failed with no result'));
        }
      }
    );

    uploadStream.end(buffer);
  });
}

export async function uploadUrlToCloudinary(
  imageUrl: string,
  options: UploadOptions = {}
): Promise<{ url: string; publicId: string; width: number; height: number }> {
  try {
    const result = await cloudinary.uploader.upload(imageUrl, {
      folder: options.folder || 'ai-generated-banners',
      public_id: options.public_id,
      resource_type: 'image',
    });

    return {
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
    };
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw error;
  }
}

export async function upscaleForPrint(
  sourceUrl: string,
  options: {
    widthInches: number;
    heightInches: number;
    dpi?: number;
  }
): Promise<{ url: string; publicId: string }> {
  const dpi = options.dpi || 150;
  const targetWidth = Math.round(options.widthInches * dpi);
  const targetHeight = Math.round(options.heightInches * dpi);

  console.log(`Upscaling to ${targetWidth}x${targetHeight}px`);

  const result = await cloudinary.uploader.upload(sourceUrl, {
    folder: 'ai-generated-banners/final',
    transformation: [
      {
        width: targetWidth,
        height: targetHeight,
        crop: 'fill',
        quality: 'auto:best',
        fetch_format: 'auto',
      },
    ],
  });

  return {
    url: result.secure_url,
    publicId: result.public_id,
  };
}

export async function generatePdfFromImage(publicId: string): Promise<string> {
  const pdfUrl = cloudinary.url(publicId, {
    format: 'pdf',
    quality: 'auto:best',
    flags: 'attachment',
  });

  return pdfUrl;
}

export async function deleteFromCloudinary(publicId: string): Promise<void> {
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    throw error;
  }
}

export default cloudinary;
