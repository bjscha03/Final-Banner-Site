'use client';
import { useEffect, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { Camera, Share, Download, X, AlertCircle } from 'lucide-react';

type Props = {
  open: boolean;
  onClose: () => void;
  widthIn: number;
  heightIn: number;
  artworkUrl?: string;
};

export default function PhotoOverlayAR({ open, onClose, widthIn, heightIn, artworkUrl }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [shotUrl, setShotUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Calculate overlay dimensions maintaining aspect ratio
  const bannerAspectRatio = widthIn / heightIn;
  const overlayWidth = Math.min(300, window.innerWidth * 0.6);
  const overlayHeight = overlayWidth / bannerAspectRatio;

  useEffect(() => {
    if (!open) return;

    const startCamera = async () => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { 
            facingMode: 'environment', // Use back camera if available
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          }
        });
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch (err) {
        console.error('Camera access failed:', err);
        setError('Camera access denied. Please allow camera permissions to use this feature.');
      }
    };

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [open]);

  useEffect(() => {
    return () => {
      if (shotUrl) URL.revokeObjectURL(shotUrl);
    };
  }, [shotUrl]);

  // Handle ESC key
  useEffect(() => {
    if (!open) return;
    
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  if (!open) return null;

  const takeSnapshot = async () => {
    if (busy || !overlayRef.current) return;
    setBusy(true);

    try {
      const canvas = await html2canvas(overlayRef.current, {
        useCORS: true,
        backgroundColor: null,
        scale: 2
      });

      canvas.toBlob((blob) => {
        if (blob) {
          setShotUrl(URL.createObjectURL(blob));
        }
        setBusy(false);
      }, 'image/png', 1);
    } catch (err) {
      console.error('Snapshot failed:', err);
      setError('Failed to capture snapshot');
      setBusy(false);
    }
  };

  const shareSnapshot = async () => {
    if (!shotUrl) return;

    try {
      const blob = await (await fetch(shotUrl)).blob();
      const file = new File([blob], 'banner-camera-preview.png', { type: 'image/png' });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Banners On The Fly – Camera Preview',
          text: `Here's my ${widthIn}" × ${heightIn}" banner preview.`
        });
      } else {
        // Fallback to download
        const a = document.createElement('a');
        a.href = shotUrl;
        a.download = 'banner-camera-preview.png';
        a.click();
      }
    } catch (err) {
      console.error('Share failed:', err);
      // Fallback to download
      const a = document.createElement('a');
      a.href = shotUrl!;
      a.download = 'banner-camera-preview.png';
      a.click();
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative w-full h-full">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 transition-colors"
          aria-label="Close Camera Preview"
        >
          <X className="h-5 w-5" />
        </button>

        <div ref={overlayRef} className="relative w-full h-full">
          {stream && (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          )}

          {/* Banner overlay */}
          <div
            className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 border-4 border-white/80 rounded-lg shadow-2xl bg-white/10 backdrop-blur-sm"
            style={{
              width: overlayWidth,
              height: overlayHeight,
            }}
          >
            {artworkUrl && (
              <img
                src={artworkUrl}
                alt="Banner preview"
                className="w-full h-full object-cover rounded opacity-70"
              />
            )}
            
            {/* Size label */}
            <div className="absolute -top-8 left-0 bg-black/70 text-white px-2 py-1 rounded text-sm font-medium">
              {widthIn}" × {heightIn}"
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 flex items-center gap-4">
          <button
            onClick={takeSnapshot}
            disabled={busy || !stream}
            className="flex items-center gap-2 bg-white text-black px-6 py-3 rounded-full font-semibold hover:bg-gray-100 disabled:opacity-60 disabled:cursor-not-allowed transition-colors shadow-lg"
          >
            <Camera className="h-5 w-5" />
            {busy ? 'Capturing...' : 'Capture'}
          </button>

          {shotUrl && (
            <>
              <button
                onClick={shareSnapshot}
                className="flex items-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-full font-semibold hover:bg-emerald-700 transition-colors shadow-lg"
              >
                <Share className="h-5 w-5" />
                Share
              </button>

              <a
                href={shotUrl}
                download="banner-camera-preview.png"
                className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-full font-semibold hover:bg-blue-700 transition-colors shadow-lg"
              >
                <Download className="h-5 w-5" />
                Download
              </a>
            </>
          )}
        </div>

        {error && (
          <div className="absolute top-20 left-1/2 transform -translate-x-1/2 flex items-center gap-2 text-sm text-red-100 bg-red-600/90 px-4 py-3 rounded-lg backdrop-blur-sm">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!stream && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <div className="text-white text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4"></div>
              <p>Starting camera...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
