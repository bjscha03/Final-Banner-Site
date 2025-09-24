  const handleResetImage = async () => {
    if (!file?.url || !isAIImage || !file.aiMetadata) {
      toast({
        title: 'No AI image to reset',
        description: 'Please generate an AI image first.',
        variant: 'destructive'
      });
      return;
    }

    setIsResettingImage(true);

    try {
      console.log('🔄 Resetting AI image to original state');

      // Extract public ID from the current image
      const publicId = file.aiMetadata?.cloudinary_public_id || extractPublicIdFromUrl(file.url);
      
      if (!publicId) {
        throw new Error('Could not extract Cloudinary public ID from image');
      }

      console.log('Using public ID for reset:', publicId);

      // Call the AI image processor to get original version
      const response = await fetch('/.netlify/functions/ai-image-processor', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'reset',
          publicId: publicId
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('AI image processor error:', errorText);
        throw new Error(`Reset failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      console.log('AI image processor reset result:', result);

      if (!result.success) {
        throw new Error(result.error || 'Image reset failed');
      }

      // Update the file with the original version
      console.log('✅ Resetting to original URL:', result.processedUrl);
      
      set({
        file: {
          ...file,
          url: result.processedUrl,
          name: file.name.replace(/_fitted_\d+x\d+|_resized_\d+x\d+|_print_ready_\d+x\d+/, ''),
          aiMetadata: {
            ...file.aiMetadata,
            // Remove any transformation metadata
            printReadyVersion: undefined,
            resizedDimensions: undefined
          }
        },
        // Reset scale to 100% when resetting image
        previewScalePct: 100
      });

      toast({
        title: 'Image reset successfully!',
        description: 'Restored AI image to its original state',
        variant: 'default'
      });

    } catch (error) {
      console.error('Error resetting image:', error);
      toast({
        title: 'Reset failed',
        description: error.message || 'Could not reset the image. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsResettingImage(false);
    }
  };
