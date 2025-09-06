'use client';
import '@google/model-viewer';
import { useEffect, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { X, Camera, Share, Download } from 'lucide-react';

type Props = {
  open: boolean;
  onClose: () => void;
  glbUrl?: string;
  usdzUrl?: string;
  widthIn: number;
  heightIn: number;
};

export default function ARPreviewModal({ open, onClose, glbUrl, usdzUrl, widthIn, heightIn }: Props) {
  const mvRef = useRef<any>(null);
  const [arStatus, setArStatus] = useState<'not-presenting'|'session-started'|'session-ended'>('not-presenting');
  const [shotUrl, setShotUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const el = mvRef.current as any;
    const handler = (e: any) => setArStatus(e.detail.status);
    el?.addEventListener('ar-status', handler);
    return () => el?.removeEventListener('ar-status', handler);
  }, [open]);

  useEffect(() => {
    return () => { 
      if (shotUrl) URL.revokeObjectURL(shotUrl); 
    };
  }, [shotUrl]);

  // Handle ESC key and backdrop click
  useEffect(() => {
    if (!open) return;
    
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  if (!open) return null;

  const makeSnapshot = async () => {
    if (busy) return; 
    setBusy(true);
    
    try {
      const el = mvRef.current as any;
      // Prefer model-viewer's capture if available (WebXR/in-page)
      if (el?.toBlob) {
        try {
          const blob = await el.toBlob({ idealAspect: true, mimeType: 'image/png' });
          if (blob) { 
            setShotUrl(URL.createObjectURL(blob)); 
            setBusy(false); 
            return; 
          }
        } catch (error) {
          console.warn('model-viewer toBlob failed, falling back to html2canvas:', error);
        }
      }
      
      // Fallback: rasterize the element
      const node = mvRef.current as HTMLElement;
      const canvas = await html2canvas(node, { 
        useCORS: true, 
        backgroundColor: '#ffffff',
        scale: 2 // Higher quality
      });
      
      canvas.toBlob((b) => { 
        if (b) setShotUrl(URL.createObjectURL(b)); 
        setBusy(false); 
      }, 'image/png', 1);
    } catch (error) {
      console.error('Snapshot failed:', error);
      setBusy(false);
    }
  };

  const shareSnapshot = async () => {
    if (!shotUrl) return;
    
    try {
      const blob = await (await fetch(shotUrl)).blob();
      const file = new File([blob], 'banner-ar-preview.png', { type: 'image/png' });
      
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ 
          files: [file], 
          title: 'Banners On The Fly – AR Preview', 
          text: `Here's my ${widthIn}" × ${heightIn}" banner preview in AR.` 
        });
      } else {
        // Fallback to download
        const a = document.createElement('a'); 
        a.href = shotUrl; 
        a.download = 'banner-ar-preview.png'; 
        a.click();
      }
    } catch (error) {
      console.error('Share failed:', error);
      // Fallback to download
      const a = document.createElement('a'); 
      a.href = shotUrl!; 
      a.download = 'banner-ar-preview.png'; 
      a.click();
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative w-[92vw] max-w-4xl rounded-2xl bg-white p-6 shadow-2xl">
        <button 
          onClick={onClose} 
          className="absolute right-4 top-4 rounded-full p-2 hover:bg-gray-100 transition-colors"
          aria-label="Close AR Preview"
        >
          <X className="h-5 w-5" />
        </button>
        
        <h3 className="mb-4 text-xl font-bold text-gray-900">
          AR Preview — {widthIn}″ × {heightIn}″ Banner
        </h3>

        {/* @ts-ignore web component */}
        <model-viewer
          ref={mvRef}
          style={{ 
            width: '100%', 
            height: 420, 
            borderRadius: 16, 
            overflow: 'hidden',
            backgroundColor: '#f8fafc'
          }}
          src={glbUrl}
          ios-src={usdzUrl}
          ar
          ar-modes="webxr scene-viewer quick-look"
          ar-scale="fixed"
          /* @ts-ignore */ 
          ar-placement="wall"
          camera-controls
          exposure="1"
          environment-image="neutral"
          shadow-intensity="0.2"
          alt={`${widthIn}" × ${heightIn}" Banner AR Preview`}
          loading="eager"
        >
          <div 
            slot="ar-button" 
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white hover:bg-indigo-700 transition-colors shadow-lg"
          >
            📱 View in AR
          </div>
        </model-viewer>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button 
            onClick={makeSnapshot} 
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 font-semibold text-white hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            <Camera className="h-4 w-4" />
            {busy ? 'Capturing…' : 'Save Snapshot'}
          </button>
          
          <button 
            onClick={shareSnapshot} 
            disabled={!shotUrl}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            <Share className="h-4 w-4" />
            Share
          </button>
          
          {shotUrl && (
            <a
              href={shotUrl}
              download="banner-ar-preview.png"
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 transition-colors"
            >
              <Download className="h-4 w-4" />
              Download
            </a>
          )}
          
          {arStatus !== 'session-started' && (
            <p className="text-xs text-slate-500 ml-2 max-w-md">
              On iOS/Android, AR opens in the system viewer—use your phone's screenshot to capture and share.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
