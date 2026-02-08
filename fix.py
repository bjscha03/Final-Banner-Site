with open('src/components/design/editor/AssetsPanel.tsx', 'r') as f:
    content = f.read()

# Replace the setTimeout block with instant execution
content = content.replace(
    '''              // AUTO-ADD: Automatically add image to canvas after upload completes
              console.log("[AssetsPanel] Auto-adding image to canvas");
              setTimeout(async () => {
                try {
                  await handleAddToCanvas(cloudinaryImage);
                  
                  // Mobile UX: Close panel and remove from list for clean experience
                  if (isMobileDevice) {
                    console.log("[AssetsPanel] MOBILE - Removing from list and closing panel");
                    setUploadedImages((prev) => prev.filter((img) => img.id !== imageId));
                    if (onClose) onClose();
                  } else {
                    // Desktop: Show toast and keep in list for re-adding
                                                                                                        duration: 2000,
                    });
                    console.log("[AssetsPanel] Image added and remains in list");
                  }
                } catch (error) {
                  console.error("[AssetsPanel] ERROR in auto-add:", error);
                }
              }, 100);''',
    '''              // AUTO-ADD: Automatically add image to canvas after upload completes (CANVA-STYLE)
              console.log("[AssetsPanel] Auto-adding image to canvas");
              try {
                await handleAddToCanvas(cloudinaryImage);
                
                // CANVA-STYLE: Always close panel for all devices
                console.log("[AssetsPanel] Closi                console.log("[AssetsPanel] Closi                console.log("[AssetsPanel           toast({
                  title: "�                                   duration: 1500,
                });
              } catch (error) {
                console.error("[AssetsPanel] ERROR in auto-add:", error);
              }'''
)

# Replace the mobile fallback block
content = content.replace(
    '''              // On mobile, still try to add with blob URL    '''                 '''              // On mobil             console.log('[AssetsPanel] 📱 MOBILE - Cloudinary failed, using blob URL as fallback');
                setTimeout(async () => {
                  try {
                    await handleAddToCanvas(tempImage);
                    setUploadedImages((prev) => prev.filter((img) => img.id !== imageId));
                    if (onClose) onClose();
                  } catch (error) {
                    console.error('[AssetsPanel] 📱 ❌ ERROR in fallback auto-add:', error);
                  }
                }, 100);
              }''',
    '''              // CANVA-STYLE: Try to add with blob URL as fallback (all devices)
              console.log('[AssetsPanel] Cloudinary failed, using blob URL as fallback');
              try {
                await handleAddToCanvas(tempImage);
                if (onClose) onClose();
                toast({
                  title: "✓ Image added",
                  description: "Using temporary URL",
                  duration: 1500,
                });
              } catch (error) {
                console.error('[AssetsPanel] ❌ ERROR in fallback auto-add:', error);
              }'''
)

with open('src/components/design/editor/AssetsPanel.tsx', 'w') as f:
    f.write(content)

print("✅ Fixed upload logic")
