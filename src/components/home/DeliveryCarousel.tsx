import React, { useRef, useEffect, useState, useCallback } from 'react';

const DELIVERY_IMAGES = [
  { src: 'https://res.cloudinary.com/dtrxl120u/image/upload/w_400,q_auto,f_auto/v1774460966/download_cz20yn.jpg', alt: 'Customer delivery photo 1 – custom vinyl banner' },
  { src: 'https://res.cloudinary.com/dtrxl120u/image/upload/w_400,q_auto,f_auto/v1774460965/download-13_vmyxvp.jpg', alt: 'Customer delivery photo 2 – printed banner package' },
  { src: 'https://res.cloudinary.com/dtrxl120u/image/upload/w_400,q_auto,f_auto/v1774460966/download-16_hck4qs.jpg', alt: 'Customer delivery photo 3 – banner order unboxing' },
  { src: 'https://res.cloudinary.com/dtrxl120u/image/upload/w_400,q_auto,f_auto/v1774460966/download-18_yyyu7k.jpg', alt: 'Customer delivery photo 4 – next-day air banner shipment' },
  { src: 'https://res.cloudinary.com/dtrxl120u/image/upload/w_400,q_auto,f_auto/v1774460966/download-17_htewfz.jpg', alt: 'Customer delivery photo 5 – rush order banner delivery' },
  { src: 'https://res.cloudinary.com/dtrxl120u/image/upload/w_400,q_auto,f_auto/v1774460966/download-15_rpzqgf.jpg', alt: 'Customer delivery photo 6 – finished banner product' },
  { src: 'https://res.cloudinary.com/dtrxl120u/image/upload/w_400,q_auto,f_auto/v1774460966/download-14_y2hhkv.jpg', alt: 'Customer delivery photo 7 – banner with grommets' },
  { src: 'https://res.cloudinary.com/dtrxl120u/image/upload/w_400,q_auto,f_auto/v1774460965/download-12_tnp4g2.jpg', alt: 'Customer delivery photo 8 – outdoor banner installed' },
  { src: 'https://res.cloudinary.com/dtrxl120u/image/upload/w_400,q_auto,f_auto/v1774460954/download-10_dknhmc.jpg', alt: 'Customer delivery photo 9 – event banner delivered' },
  { src: 'https://res.cloudinary.com/dtrxl120u/image/upload/w_400,q_auto,f_auto/v1774460954/download-9_hpdvaf.jpg', alt: 'Customer delivery photo 10 – trade show banner' },
  { src: 'https://res.cloudinary.com/dtrxl120u/image/upload/w_400,q_auto,f_auto/v1774460954/download-11_hxfr9e.jpg', alt: 'Customer delivery photo 11 – business banner order' },
  { src: 'https://res.cloudinary.com/dtrxl120u/image/upload/w_400,q_auto,f_auto/v1774460953/download-7_eoowij.jpg', alt: 'Customer delivery photo 12 – promotional banner' },
  { src: 'https://res.cloudinary.com/dtrxl120u/image/upload/w_400,q_auto,f_auto/v1774460953/download-8_xlfbuv.jpg', alt: 'Customer delivery photo 13 – custom printed banner' },
  { src: 'https://res.cloudinary.com/dtrxl120u/image/upload/w_400,q_auto,f_auto/v1774460953/download-1_un1zb8.jpg', alt: 'Customer delivery photo 14 – vinyl banner shipment' },
  { src: 'https://res.cloudinary.com/dtrxl120u/image/upload/w_400,q_auto,f_auto/v1774460953/download-4_mags5c.jpg', alt: 'Customer delivery photo 15 – storefront banner' },
  { src: 'https://res.cloudinary.com/dtrxl120u/image/upload/w_400,q_auto,f_auto/v1774460953/download-3_sokqqv.jpg', alt: 'Customer delivery photo 16 – grand opening banner' },
  { src: 'https://res.cloudinary.com/dtrxl120u/image/upload/w_400,q_auto,f_auto/v1774460953/download-6_xtzq7z.jpg', alt: 'Customer delivery photo 17 – banner display setup' },
  { src: 'https://res.cloudinary.com/dtrxl120u/image/upload/w_400,q_auto,f_auto/v1774460953/download-2_pzrd1q.jpg', alt: 'Customer delivery photo 18 – indoor banner installation' },
  { src: 'https://res.cloudinary.com/dtrxl120u/image/upload/w_400,q_auto,f_auto/v1774460953/download-5_wolqqp.jpg', alt: 'Customer delivery photo 19 – completed banner order' },
];

const DeliveryCarousel: React.FC = () => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartX = useRef(0);
  const scrollStartX = useRef(0);

  // Seamless infinite scroll reset
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const handleScroll = () => {
      const halfWidth = track.scrollWidth / 2;
      if (track.scrollLeft >= halfWidth) {
        track.scrollLeft -= halfWidth;
      } else if (track.scrollLeft <= 0) {
        track.scrollLeft += halfWidth;
      }
    };

    track.addEventListener('scroll', handleScroll);
    return () => track.removeEventListener('scroll', handleScroll);
  }, []);

  // Auto-scroll animation
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    let animationId: number;
    const speed = 0.8; // pixels per frame

    const step = () => {
      if (!isPaused && !isDragging) {
        track.scrollLeft += speed;
        // Reset for seamless loop
        const halfWidth = track.scrollWidth / 2;
        if (track.scrollLeft >= halfWidth) {
          track.scrollLeft -= halfWidth;
        }
      }
      animationId = requestAnimationFrame(step);
    };

    animationId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animationId);
  }, [isPaused, isDragging]);

  // Touch/drag handlers for mobile swipe
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    setIsDragging(true);
    dragStartX.current = e.clientX;
    scrollStartX.current = trackRef.current?.scrollLeft ?? 0;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging || !trackRef.current) return;
    const dx = e.clientX - dragStartX.current;
    trackRef.current.scrollLeft = scrollStartX.current - dx;
  }, [isDragging]);

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const track = trackRef.current;
    if (!track) return;
    const scrollAmount = 220;
    if (e.key === 'ArrowRight') {
      track.scrollLeft += scrollAmount;
      e.preventDefault();
    } else if (e.key === 'ArrowLeft') {
      track.scrollLeft -= scrollAmount;
      e.preventDefault();
    }
  }, []);

  // Duplicate images for seamless loop
  const allImages = [...DELIVERY_IMAGES, ...DELIVERY_IMAGES];

  return (
    <section className="py-10 sm:py-14 bg-gray-50 overflow-hidden">
      {/* Section header */}
      <div className="text-center mb-8 px-4">
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">
          Real Orders. Delivered Fast.
        </h2>
        <p className="mt-2 text-sm sm:text-base text-gray-500">
          Photos from actual Banners on the Fly deliveries
        </p>
      </div>

      {/* Carousel track */}
      <div
        ref={trackRef}
        role="region"
        aria-label="Delivery photo carousel"
        tabIndex={0}
        className="flex gap-3 overflow-x-hidden cursor-grab select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 rounded-sm"
        style={{ WebkitOverflowScrolling: 'touch' }}
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => { setIsPaused(false); setIsDragging(false); }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleKeyDown}
        onFocus={() => setIsPaused(true)}
        onBlur={() => setIsPaused(false)}
      >
        {allImages.map((img, i) => (
          <div
            key={i}
            className="relative flex-shrink-0 h-[160px] sm:h-[200px] rounded-[10px] overflow-hidden shadow-md"
            style={{ aspectRatio: '4 / 3' }}
          >
            <img
              src={img.src}
              alt={img.alt}
              loading="lazy"
              draggable={false}
              className="w-full h-full object-cover pointer-events-none"
            />
            {/* Delivered badge */}
            <span className="absolute bottom-2 left-2 bg-black/60 text-white text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded-md backdrop-blur-sm">
              ✓ Delivered
            </span>
          </div>
        ))}
      </div>
    </section>
  );
};

export default DeliveryCarousel;
