    // For thumbnail requests, we can use Cloudinary's transformation API
    const isThumbailRequest = !!fileKey && download !== 'true';
    
    if (isThumbailRequest) {
      // For thumbnails, generate a Cloudinary URL with transformations
      let cloudinaryUrl;
      
      // Check if it's a PDF or image
      const isPdf = requestedKey.includes('.pdf') || requestedKey.includes('raw');
      
      if (isPdf) {
        // For PDFs, use the raw resource type and generate a thumbnail
        cloudinaryUrl = cloudinary.url(requestedKey, {
          resource_type: 'raw',
          format: 'jpg',
          page: 1,
          width: 150,
          height: 150,
          crop: 'fill',
          quality: 'auto'
        });
      } else {
        // For images, use standard image transformations
        cloudinaryUrl = cloudinary.url(requestedKey, {
          resource_type: 'image',
          width: 150,
          height: 150,
          crop: 'fill',
          quality: 'auto'
        });
      }
      
      console.log('Generated Cloudinary thumbnail URL:', cloudinaryUrl);
      
      // Redirect to the Cloudinary URL for thumbnails
      return {
        statusCode: 302,
        headers: {
          ...headers,
          'Location': cloudinaryUrl,
          'Cache-Control': 'public, max-age=3600', // Cache thumbnails for 1 hour
        },
        body: '',
      };
    } else {
      // For file downloads, redirect to Cloudinary URL with attachment flag
      let downloadUrl;
      
      // Check if it's a PDF or image to determine resource type
      const isPdf = requestedKey.includes('.pdf') || requestedKey.includes('raw');
      
      if (isPdf) {
        // For PDFs, use the raw resource type
        downloadUrl = cloudinary.url(requestedKey, {
          resource_type: 'raw',
          flags: 'attachment'
        });
      } else {
        // For images, use standard image resource type with attachment flag
        downloadUrl = cloudinary.url(requestedKey, {
          resource_type: 'image',
          flags: 'attachment'
        });
      }
      
      console.log('Generated Cloudinary download URL:', downloadUrl);
      
      // Redirect to the Cloudinary URL for downloads
      return {
        statusCode: 302,
        headers: {
          ...headers,
          'Location': downloadUrl,
          'Cache-Control': 'private, no-cache',
        },
        body: '',
      };
    }

  } catch (error) {
    console.error('Error in download-file function:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: error.message 
      }),
    };
  }
};
