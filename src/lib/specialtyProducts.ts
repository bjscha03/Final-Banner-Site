/**
 * Retail catalog for products fulfilled through a custom shipping quote.
 * These are customer-facing retail prices, not supplier costs. They must not
 * enter the standard banner/cart checkout until shipping can be rated and
 * repriced by the server.
 */
export type SpecialtyCategory = 'stands' | 'flags' | 'events' | 'signs';
export type SpecialtyVisual = 'retractable' | 'xstand' | 'backdrop' | 'flag' | 'table' | 'tent' | 'sign' | 'poster';

export interface SpecialtyVariant {
  label: string;
  priceCents?: number;
  widthIn?: number;
  heightIn?: number;
}

export interface SpecialtyProduct {
  slug: string;
  name: string;
  category: SpecialtyCategory;
  visual: SpecialtyVisual;
  eyebrow: string;
  summary: string;
  description: string;
  features: string[];
  variants: SpecialtyVariant[];
  priceUnit?: 'each' | 'sqft';
  minOrderCents?: number;
  note?: string;
}

export const specialtyCategories: Record<SpecialtyCategory, { label: string; description: string }> = {
  stands: { label: 'Banner stands & backdrops', description: 'Portable displays for counters, lobbies and trade shows.' },
  flags: { label: 'Advertising flags', description: 'Tall, visible graphics for storefronts and outdoor events.' },
  events: { label: 'Event gear', description: 'Table covers and tents that make a whole booth feel intentional.' },
  signs: { label: 'Rigid signs & posters', description: 'Polished graphics for walls, wayfinding and long-lasting displays.' },
};

export const specialtyProducts: SpecialtyProduct[] = [
  {
    slug: 'standard-retractable-banner', name: 'Standard Retractable Banner', category: 'stands', visual: 'retractable', eyebrow: 'Most popular portable display',
    summary: 'A complete, easy-to-carry banner stand for events and sales floors.',
    description: 'Choose a printed graphic with the stand and carrying bag. Replacement inserts and alternate materials can be included in a custom quote.',
    features: ['Aluminum retractable base', 'Carrying bag included', 'Multiple sizes'],
    variants: [
      { label: '23 × 66 in · stand + graphic', priceCents: 15299, widthIn: 23, heightIn: 66 },
      { label: '24 × 81 in · stand + graphic', priceCents: 15899, widthIn: 24, heightIn: 81 },
      { label: '33 × 81 in · stand + graphic', priceCents: 12299, widthIn: 33, heightIn: 81 },
      { label: '47 × 81 in · stand + graphic', priceCents: 24999, widthIn: 47, heightIn: 81 },
    ],
  },
  {
    slug: 'deluxe-retractable-banner', name: 'Deluxe Retractable Banner', category: 'stands', visual: 'retractable', eyebrow: 'Upgraded hardware',
    summary: 'A sturdier 33-inch display, available with one or two printed sides.',
    description: 'A premium version of the portable retractable stand for a more permanent presentation.',
    features: ['Upgraded stand', 'Single or double sided', '33 × 81 in graphic'],
    variants: [
      { label: '33 × 81 in · single sided', priceCents: 18399, widthIn: 33, heightIn: 81 },
      { label: '33 × 81 in · double sided', priceCents: 45299, widthIn: 33, heightIn: 81 },
    ],
  },
  {
    slug: 'premium-retractable-banner', name: 'Premium Retractable Banner', category: 'stands', visual: 'retractable', eyebrow: 'Wider impact',
    summary: 'A height-adjustable stand in three wide formats.',
    description: 'A high-end retractable display with adjustable height for larger presentations.',
    features: ['Height-adjustable hardware', 'Three widths', 'Portable display'],
    variants: [
      { label: '36 × 92 in', priceCents: 24499, widthIn: 36, heightIn: 92 },
      { label: '48 × 92 in', priceCents: 33399, widthIn: 48, heightIn: 92 },
      { label: '60 × 92 in', priceCents: 43999, widthIn: 60, heightIn: 92 },
    ],
  },
  {
    slug: 'x-banner-stand', name: 'X Banner Stand', category: 'stands', visual: 'xstand', eyebrow: 'Lightweight & interchangeable',
    summary: 'An affordable stand with graphics that are easy to change.',
    description: 'A compact, lightweight X-frame suited to short events and promotions.',
    features: ['Easy-change graphic', 'Lightweight frame', 'Two sizes'],
    variants: [
      { label: '24 × 63 in · stand + graphic', priceCents: 6799, widthIn: 24, heightIn: 63 },
      { label: '32 × 71 in · stand + graphic', priceCents: 9199, widthIn: 32, heightIn: 71 },
    ],
  },
  {
    slug: 'tabletop-banner-stand', name: 'Tabletop Banner Stand', category: 'stands', visual: 'retractable', eyebrow: 'Small space, strong message',
    summary: 'A miniature retractable display for counters and tables.',
    description: 'Put a compact graphic at eye level on a registration desk, counter or event table.',
    features: ['Mini retractable hardware', 'Stay-flat printed graphic', 'Counter-friendly size'],
    variants: [{ label: '11.5 × 17.5 in', priceCents: 4899, widthIn: 11.5, heightIn: 17.5 }],
  },
  {
    slug: 'tension-fabric-stand', name: 'Tension Fabric Stand', category: 'stands', visual: 'backdrop', eyebrow: 'Fabric presentation',
    summary: 'A portable fabric display with a smooth, polished look.',
    description: 'Dye-sublimated washable fabric wraps over heavy-duty portable hardware.',
    features: ['Washable printed fabric', 'Portable hardware', 'Double-sided display option'],
    variants: [
      { label: '36 × 90 in', priceCents: 31799, widthIn: 36, heightIn: 90 },
      { label: '48 × 90 in', priceCents: 36699, widthIn: 48, heightIn: 90 },
    ],
    note: 'Pricing shown is for the base configuration. Confirm the print sides in your quote.',
  },
  {
    slug: 'step-and-repeat-backdrop', name: 'Step & Repeat Backdrop', category: 'stands', visual: 'backdrop', eyebrow: 'Photo-ready branding',
    summary: 'A wide fabric backdrop for photos, stages and sponsor walls.',
    description: 'A printed fabric graphic on a portable, heavy-duty tube frame.',
    features: ['Printed fabric graphic', 'Portable frame', 'More sizes available by quote'],
    variants: [{ label: '10 × 8 ft · backdrop + frame', priceCents: 43799, widthIn: 120, heightIn: 96 }],
  },
  {
    slug: 'feather-flags', name: 'Feather Flags', category: 'flags', visual: 'flag', eyebrow: 'Storefront favorite',
    summary: 'A tall outdoor display in angled or convex shapes.',
    description: 'Choose the shape, size and base that fit your space. We will confirm the price for double-sided printing and alternate bases.',
    features: ['Angled or convex silhouette', 'Indoor and outdoor base options', 'Single or double sided'],
    variants: [
      { label: 'Angled · 9 ft', priceCents: 14599 }, { label: 'Angled · 10.5 ft', priceCents: 14599 },
      { label: 'Angled · 14 ft', priceCents: 15599 }, { label: 'Angled · 18 ft', priceCents: 19599 },
      { label: 'Convex · 9 ft', priceCents: 14599 }, { label: 'Convex · 10.5 ft', priceCents: 14599 },
      { label: 'Convex · 14 ft', priceCents: 15599 }, { label: 'Convex · 18 ft', priceCents: 19599 },
    ],
  },
  {
    slug: 'teardrop-flags', name: 'Teardrop Flags', category: 'flags', visual: 'flag', eyebrow: 'Wind-friendly shape',
    summary: 'A curved flag that keeps its message visible at outdoor events.',
    description: 'Available in four heights with indoor/outdoor base and print-side choices.',
    features: ['Four heights', 'Base options', 'Single or double sided'],
    variants: [
      { label: '7 ft', priceCents: 14599 }, { label: '9 ft', priceCents: 14599 },
      { label: '11.2 ft', priceCents: 15599 }, { label: '13.5 ft', priceCents: 19599 },
    ],
  },
  {
    slug: 'rectangle-flags', name: 'Rectangle Flags', category: 'flags', visual: 'flag', eyebrow: 'More room for your message',
    summary: 'A straight-sided flag with a broad print area.',
    description: 'Choose a size and tell us whether the display is for indoor or outdoor use.',
    features: ['Broad graphic area', 'Three heights', 'Base and print-side options'],
    variants: [
      { label: '8.5 ft', priceCents: 22899 }, { label: '11.8 ft', priceCents: 25499 },
      { label: '15 ft', priceCents: 27999 },
    ],
  },
  {
    slug: 'economy-feather-flag', name: 'Economy Feather Flag', category: 'flags', visual: 'flag', eyebrow: 'Simple outdoor setup',
    summary: 'A single-sided flag with a ground spike included.',
    description: 'A tall outdoor-only display that moves naturally in the wind.',
    features: ['Ground spike included', 'Single-sided graphic', 'Outdoor use'],
    variants: [{ label: '16 ft', priceCents: 16899 }],
  },
  {
    slug: 'standard-table-throws', name: 'Standard Table Throws', category: 'events', visual: 'table', eyebrow: 'Dress the whole table',
    summary: 'Full-color fabric table covers in open or closed back styles.',
    description: 'A dye-sublimated table cover for a coordinated event setup.',
    features: ['Full-color print', '3-sided open back or 4-sided closed back', '4, 6 and 8 ft tables'],
    variants: [
      { label: '4 ft · open back', priceCents: 14099, widthIn: 48 }, { label: '4 ft · closed back', priceCents: 18599, widthIn: 48 },
      { label: '6 ft · open back', priceCents: 17599, widthIn: 72 }, { label: '6 ft · closed back', priceCents: 23299, widthIn: 72 },
      { label: '8 ft · open back', priceCents: 20899, widthIn: 96 }, { label: '8 ft · closed back', priceCents: 27899, widthIn: 96 },
    ],
  },
  {
    slug: 'fitted-table-throws', name: 'Fitted Table Throws', category: 'events', visual: 'table', eyebrow: 'Tailored look',
    summary: 'A box-style table cover for a clean, fitted setup.',
    description: 'Full-color printed fabric shaped to fit a standard event table.',
    features: ['Full-color print', 'Open or closed back', '6 and 8 ft tables'],
    variants: [
      { label: '6 ft · open back', priceCents: 17799, widthIn: 72 }, { label: '6 ft · closed back', priceCents: 17799, widthIn: 72 },
      { label: '8 ft · open back', priceCents: 19999, widthIn: 96 }, { label: '8 ft · closed back', priceCents: 19999, widthIn: 96 },
    ],
  },
  {
    slug: 'stretch-table-throws', name: 'Stretch Table Throws', category: 'events', visual: 'table', eyebrow: 'Modern fitted shape',
    summary: 'A taut stretch cover for a sleek booth presentation.',
    description: 'Full-color dye-sublimated fabric with a fitted silhouette.',
    features: ['Stretch fit', 'Full-color print', '6 and 8 ft tables'],
    variants: [
      { label: '6 ft', priceCents: 31499, widthIn: 72 }, { label: '8 ft', priceCents: 37899, widthIn: 96 },
    ],
  },
  {
    slug: 'custom-event-tents', name: 'Custom Event Tents', category: 'events', visual: 'tent', eyebrow: 'A whole branded space',
    summary: 'Printed canopy and aluminum frame in three event sizes.',
    description: 'Create a branded outdoor footprint. Walls, bags, flags and other accessories are quoted separately.',
    features: ['Printed weather-resistant canopy', 'Aluminum frame and carry bag', '10 × 10, 10 × 15 and 10 × 20 ft'],
    variants: [
      { label: '10 × 10 ft · canopy + frame', priceCents: 88699, widthIn: 120, heightIn: 120 },
      { label: '10 × 15 ft · canopy + frame', priceCents: 146499, widthIn: 180, heightIn: 120 },
      { label: '10 × 20 ft · canopy + frame', priceCents: 173199, widthIn: 240, heightIn: 120 },
    ],
    note: 'Production timing and freight costs are confirmed after artwork and shipping details are reviewed.',
  },
  {
    slug: 'acrylic-signs', name: 'Acrylic Signs', category: 'signs', visual: 'sign', eyebrow: 'Clean, modern finish',
    summary: 'Clear acrylic graphics for offices, lobbies and retail walls.',
    description: 'A custom-sized rigid sign with optional white printing and finishing. Final pricing depends on size and hardware.',
    features: ['Custom dimensions', 'White ink available', 'Interior display'], priceUnit: 'sqft',
    variants: [{ label: 'Base print · per sq ft', priceCents: 3599 }],
  },
  {
    slug: 'aluminum-signs', name: 'Solid Aluminum Signs', category: 'signs', visual: 'sign', eyebrow: 'Built for outdoors',
    summary: 'Durable .040-inch aluminum for real estate, directions and street-style signage.',
    description: 'A rigid sign printed on solid aluminum. Holes, corners and double-sided printing can be specified in your quote.',
    features: ['Solid aluminum', 'Outdoor-ready', 'Custom dimensions'], priceUnit: 'sqft',
    variants: [{ label: 'Base print · per sq ft', priceCents: 1499 }],
  },
  {
    slug: 'aluminum-composite-signs', name: 'Aluminum Composite Signs', category: 'signs', visual: 'sign', eyebrow: 'Lightweight durability',
    summary: 'Aluminum faces bonded around a rigid core for polished indoor or outdoor signs.',
    description: 'Also called aluminum sandwich board. Custom sizes, optional drilled holes and double-sided printing are available by quote.',
    features: ['1/8-inch composite panel', 'Indoor and outdoor use', 'Single or double sided'], priceUnit: 'sqft',
    variants: [{ label: 'Base print · per sq ft', priceCents: 1099 }],
    note: 'Oversized panels may require special shipping or local pickup.',
  },
  {
    slug: 'display-posters', name: 'Durable Display Posters', category: 'signs', visual: 'poster', eyebrow: 'Smooth, lay-flat graphics',
    summary: 'A flexible 14 mil PVC poster for displays and inserts.',
    description: 'These are durable PVC display graphics rather than conventional paper posters. Tell us the finished size for an exact quote.',
    features: ['Lay-flat PVC material', 'Matte UV print', 'Custom size'], priceUnit: 'sqft',
    variants: [{ label: 'Base print · per sq ft', priceCents: 449 }], minOrderCents: 1799,
  },
];

export function getSpecialtyProduct(slug?: string | null): SpecialtyProduct | undefined {
  return specialtyProducts.find((product) => product.slug === slug);
}

export function formatSpecialtyPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function specialtyStartingPrice(product: SpecialtyProduct): number | undefined {
  const prices = product.variants.map((variant) => variant.priceCents).filter((price): price is number => typeof price === 'number');
  return prices.length ? Math.min(...prices) : undefined;
}
