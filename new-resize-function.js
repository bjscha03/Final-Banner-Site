  const handleResizeImage = async () => {
    if (!file?.url || !isAIImage || !file.aiMetadata) {
      toast({
        title: 'No AI image to resize',
        description: 'Please generate an AI image first.',
        variant: 'destructive'
      });
      return;
    }

    setIsResizingImage(true);

    try {
      console.log(`🔄 Generating print-ready version for ${widthIn}×${heightIn}"`);

      // Extract public ID from the current image
      const publicId = file.aiMetadata?.cloudinary_public_id || extractPublicIdFromUrl(file.url);
      
      if (!publicId) {
        throw new Error('Could not extract Cloudinary public ID from image');
      }

      console.log('Using public ID:', publicId);

      // Call the new AI image processor
      const response = await fetch('/.netlify/functions/ai-image-processor', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'resize',
          publicId: publicId,
          widthIn: widthIn,
          heightIn: heightIn
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('AI image processor error:', errorText);
        throw new Error(`Processing failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      console.log('AI image processor result:', result);

      if (!result.success) {
        throw new Error(result.error || 'Image processing failed');
      }

      // Update the file with the print-ready version
      console.log('✅ Updating file with print-ready URL:', result.processedUrl);
      
      set({
        file: {
          ...file,
          url: result.processedUrl,
          name: file.name.replace(/_fitted_\d+x\d+|_resized_\d+x\d+|_print_ready_\d+x\d+/, '') + `_print_ready_${widthIn}x${heightIn}`,
          aiMetadata: {
            ...file.aiMetadata,
            printReadyVersion: {
              url: result.processedUrl,
              dimensions: result.dimensions,
              widthIn: widthIn,
              heightIn: heightIn
            }
          }
        }
      });

      toast({
        title: 'Print-ready version generated!',
        description: `Created high-resolution file at ${result.dimensions?.dpi || 150} DPI for ${widthIn}×${heightIn}" banner`,
        variant: 'default'
      });

    } catch (error) {
      console.error('Error generating print-ready version:', error);
      toast({
        title: 'Resize failed',
        description: error.message || 'Could not generate print-ready version. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsResizingImage(false);
    }
  };
