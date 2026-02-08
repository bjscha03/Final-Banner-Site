with open('src/components/design/editor/AssetsPanel.tsx', 'r') as f:
    content = f.read()

# Replace the auto-add block
old_block = '''              // AUTO-ADD: Automatically add image to canvas after upload completes
              console.log("[AssetsPanel] Auto-adding image to canvas");
              setTimeout(async () => {
                try {
                  await handleAddToCanvas(cloudinaryImage);
                  toast({
                    title: "Image added to banner",
                    duration: 2000,
                  });
                  console.log("[AssetsPanel] Image added and remains in list");
                } catch (error) {
                  console.error("[AssetsPanel] ERROR in auto-add:", error);
                }
              }, 100);'''

new_block = '''              // AUTO-ADD: Automatically add image to canvas after upload completes
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
                    toast({
                      title: "Image added to banner",
                                                          });
                    console.log("[AssetsPanel] Image added and rem                                      cons          } catch (error) {
                  console.error("[AssetsPanel] ERROR in auto-add:", error);
                }
              }, 100);'''

content = content.replacecontent = content.replacecontent = compcontent = content.rex', 'w') as f:
    f.write(content)

print("Done!")
