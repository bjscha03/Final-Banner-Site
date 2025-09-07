/**
 * AR Launcher utility for iOS Quick Look and Android Scene Viewer
 * Ensures proper AR functionality across mobile devices
 */

/**
 * Ensures viewport is at top before launching AR
 */
function ensureScrollTop() {
  window.scrollTo(0, 0);
  requestAnimationFrame(() => window.scrollTo(0, 0));
}

/**
 * Detects if the device is iOS
 */
function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

/**
 * Detects if the device is Android
 */
function isAndroid(): boolean {
  return /Android/.test(navigator.userAgent);
}

/**
 * Launches AR experience on iOS or Android
 * Must be called within a user gesture context (click handler)
 */
export function launchAR({ 
  usdzUrl, 
  glbUrl 
}: {
  usdzUrl: string; 
  glbUrl: string;
}) {
  // Ensure viewport is at top
  ensureScrollTop();

  if (isIOS()) {
    // iOS Quick Look
    const anchor = document.createElement('a');
    anchor.setAttribute('rel', 'ar');
    anchor.href = usdzUrl; // Must be HTTPS with Content-Type: model/vnd.usdz+zip
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    
    // Trigger click
    anchor.click();
    
    // Clean up
    setTimeout(() => {
      document.body.removeChild(anchor);
    }, 100);
  } else if (isAndroid()) {
    // Android Scene Viewer
    const sceneViewerUrl = `https://arvr.google.com/scene-viewer/1.0?file=${encodeURIComponent(glbUrl)}&mode=ar_preferred`;
    const anchor = document.createElement('a');
    anchor.href = sceneViewerUrl;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    
    // Trigger click
    anchor.click();
    
    // Clean up
    setTimeout(() => {
      document.body.removeChild(anchor);
    }, 100);
  } else {
    // Desktop fallback - show message
    alert('AR viewing is available on iOS and Android devices. Please open this page on a mobile device to view in AR.');
  }
}

/**
 * Checks if AR is supported on the current device
 */
export function isARSupported(): boolean {
  return isIOS() || isAndroid();
}

/**
 * Gets the appropriate AR platform name for display
 */
export function getARPlatformName(): string {
  if (isIOS()) return 'iOS Quick Look';
  if (isAndroid()) return 'Android Scene Viewer';
  return 'AR Viewer';
}

/**
 * Creates an AR-enabled button with proper event handling
 */
export function createARButton({
  usdzUrl,
  glbUrl,
  className = '',
  children = 'View in AR'
}: {
  usdzUrl: string;
  glbUrl: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const handleClick = (e: React.MouseEvent) => {
    // Prevent any parent event handlers
    e.preventDefault();
    e.stopPropagation();
    
    // Launch AR (must be in user gesture context)
    launchAR({ usdzUrl, glbUrl });
  };

  return {
    onClick: handleClick,
    className: `touch-manipulation min-h-[44px] ${className}`,
    'aria-label': `View in ${getARPlatformName()}`,
    children
  };
}
