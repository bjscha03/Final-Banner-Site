/**
 * SEO-optimized category data for banner products
 */

export interface CategorySEO {
  slug: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  h1: string;
  description: string;
  keywords: string[];
  canonicalUrl: string;
  ogImage: string;
  breadcrumbs: { name: string; url: string }[];
  schema: {
    type: 'Product' | 'Service';
    name: string;
    description: string;
    image: string;
    offers?: {
      price: string;
      priceCurrency: string;
      availability: string;
    };
  };
  content: {
    features: string[];
    uses: string[];
    sizes: string[];
    materials?: string[];
  };
  relatedCategories: string[];
}

export const categoryData: Record<string, CategorySEO> = {
  'trade-show-banners': {
    slug: 'trade-show-banners',
    title: 'Trade Show Banners',
    metaTitle: 'Trade Show Banners | Professional Display | 24-Hour Production',
    metaDescription: 'Professional trade show banners with vibrant graphics. Lightweight, portable, and easy to set up. Custom sizes. Free next-day air shipping.',
    h1: 'Professional Trade Show Banners',
    description: 'Make a lasting impression at your next trade show with our professional banners. Lightweight yet durable, our trade show banners feature vibrant full-color graphics.',
    keywords: ['trade show banners', 'exhibition banners', 'trade show displays'],
    canonicalUrl: 'https://bannersonthefly.com/trade-show-banners',
    ogImage: '/images/logo-social.svg',
    breadcrumbs: [{ name: 'Home', url: '/' }, { name: 'Trade Show Banners', url: '/trade-show-banners' }],
    schema: {
      type: 'Product',
      name: 'Trade Show Banners',
      description: 'Professional trade show banners with vibrant graphics',
      image: '/images/logo-social.svg',
      offers: { price: '39.99', priceCurrency: 'USD', availability: 'https://schema.org/InStock' }
    },
    content: {
      features: ['Lightweight and portable', 'Vibrant full-color graphics', 'Easy setup and takedown', 'Professional finish', 'Reinforced edges', '24-hour production'],
      uses: ['Trade shows and exhibitions', 'Business conferences', 'Product launches', 'Corporate events', 'Networking events', 'Career fairs'],
      sizes: ['2ft x 5ft', '3ft x 6ft', '4ft x 8ft', '5ft x 8ft', 'Custom sizes available'],
      materials: ['13oz Vinyl', '15oz Vinyl']
    },
    relatedCategories: ['event-banners', 'indoor-banners']
  },
  'food-truck-banners': {
    slug: 'food-truck-banners',
    title: 'Food Truck Banners',
    metaTitle: 'Food Truck Banners | Custom Menu Boards | Free Shipping',
    metaDescription: 'Eye-catching food truck banners and menu boards. Weather-resistant, vibrant colors. Custom sizes for any truck. 24-hour production.',
    h1: 'Custom Food Truck Banners',
    description: 'Attract more customers with eye-catching food truck banners. Our weather-resistant banners feature vibrant colors that showcase your menu and brand.',
    keywords: ['food truck banners', 'food truck menu boards', 'mobile food banners'],
    canonicalUrl: 'https://bannersonthefly.com/food-truck-banners',
    ogImage: '/images/logo-social.svg',
    breadcrumbs: [{ name: 'Home', url: '/' }, { name: 'Food Truck Banners', url: '/food-truck-banners' }],
    schema: {
      type: 'Product',
      name: 'Food Truck Banners',
      description: 'Weather-resistant food truck banners with vibrant menu graphics',
      image: '/images/logo-social.svg',
      offers: { price: '44.99', priceCurrency: 'USD', availability: 'https://schema.org/InStock' }
    },
    content: {
      features: ['Weather-resistant materials', 'Vibrant food photography', 'Easy to clean surface', 'UV-resistant inks', 'Custom sizes for any truck', 'Grommets for easy hanging'],
      uses: ['Food truck menu boards', 'Mobile food vendors', 'Food trailers', 'Catering events', 'Farmers markets', 'Festival food stands'],
      sizes: ['2ft x 3ft', '3ft x 5ft', '4ft x 6ft', '4ft x 8ft', 'Custom sizes available'],
      materials: ['15oz Vinyl', '18oz Vinyl']
    },
    relatedCategories: ['outdoor-banners', 'event-banners']
  },
  'outdoor-banners': {
    slug: 'outdoor-banners',
    title: 'Outdoor Banners',
    metaTitle: 'Outdoor Banners | Weather-Resistant | Free Next-Day Shipping',
    metaDescription: 'Durable outdoor banners built to last. UV-resistant, waterproof materials. Custom sizes. 24-hour production.',
    h1: 'Weather-Resistant Outdoor Banners',
    description: 'Our outdoor banners are engineered to withstand the elements. Made with heavy-duty vinyl and UV-resistant inks, these banners maintain their vibrant appearance.',
    keywords: ['outdoor banners', 'weather resistant banners', 'outdoor advertising banners'],
    canonicalUrl: 'https://bannersonthefly.com/outdoor-banners',
    ogImage: '/images/logo-social.svg',
    breadcrumbs: [{ name: 'Home', url: '/' }, { name: 'Outdoor Banners', url: '/outdoor-banners' }],
    schema: {
      type: 'Product',
      name: 'Outdoor Banners',
      description: 'Weather-resistant outdoor banners with UV protection',
      image: '/images/logo-social.svg',
      offers: { price: '32.99', priceCurrency: 'USD', availability: 'https://schema.org/InStock' }
    },
    content: {
      features: ['UV-resistant inks', 'Waterproof materials', 'Heavy-duty vinyl', 'Reinforced grommets', 'Fade-resistant', 'Long-lasting durability'],
      uses: ['Storefront advertising', 'Outdoor events', 'Construction sites', 'Real estate signs', 'Parking lot promotions', 'Roadside advertising'],
      sizes: ['3ft x 6ft', '4ft x 8ft', '5ft x 10ft', '6ft x 12ft', 'Custom sizes up to 10ft x 50ft'],
      materials: ['15oz Vinyl', '18oz Vinyl', 'Mesh Vinyl']
    },
    relatedCategories: ['construction-banners']
  },
  'indoor-banners': {
    slug: 'indoor-banners',
    title: 'Indoor Banners',
    metaTitle: 'Indoor Banners | Lightweight Display | Free Next-Day Shipping',
    metaDescription: 'Professional indoor banners for retail, events, and offices. Lightweight 13oz vinyl. Vibrant colors. Custom sizes. 24-hour production.',
    h1: 'Professional Indoor Banners',
    description: 'Perfect for indoor environments, our lightweight banners deliver stunning graphics without the heavy-duty materials needed for outdoor use.',
    keywords: ['indoor banners', 'retail banners', 'office banners'],
    canonicalUrl: 'https://bannersonthefly.com/indoor-banners',
    ogImage: '/images/logo-social.svg',
    breadcrumbs: [{ name: 'Home', url: '/' }, { name: 'Indoor Banners', url: '/indoor-banners' }],
    schema: {
      type: 'Product',
      name: 'Indoor Banners',
      description: 'Lightweight indoor banners for retail and events',
      image: '/images/logo-social.svg',
      offers: { price: '27.99', priceCurrency: 'USD', availability: 'https://schema.org/InStock' }
    },
    content: {
      features: ['Lightweight 13oz vinyl', 'Vibrant full-color printing', 'Easy to hang and transport', 'Professional finish', 'Cost-effective solution', 'Quick 24-hour production'],
      uses: ['Retail store displays', 'Office signage', 'Indoor events', 'Trade show booths', 'Conference rooms', 'Showroom displays'],
      sizes: ['2ft x 4ft', '3ft x 6ft', '4ft x 6ft', '4ft x 8ft', 'Custom sizes available'],
      materials: ['13oz Vinyl']
    },
    relatedCategories: ['trade-show-banners', 'event-banners']
  },
  'event-banners': {
    slug: 'event-banners',
    title: 'Event Banners',
    metaTitle: 'Event Banners | Custom Event Signage | 24-Hour Production',
    metaDescription: 'Eye-catching event banners for festivals, concerts, and special occasions. Custom designs. Durable materials. Free next-day air shipping.',
    h1: 'Custom Event Banners',
    description: 'Make your event unforgettable with custom event banners. Whether it is a festival, concert, corporate event, or celebration, our banners help you create the perfect atmosphere.',
    keywords: ['event banners', 'festival banners', 'concert banners'],
    canonicalUrl: 'https://bannersonthefly.com/event-banners',
    ogImage: '/images/logo-social.svg',
    breadcrumbs: [{ name: 'Home', url: '/' }, { name: 'Event Banners', url: '/event-banners' }],
    schema: {
      type: 'Product',
      name: 'Event Banners',
      description: 'Custom event banners for festivals and special occasions',
      image: '/images/logo-social.svg',
      offers: { price: '35.99', priceCurrency: 'USD', availability: 'https://schema.org/InStock' }
    },
    content: {
      features: ['Eye-catching designs', 'Durable materials', 'Indoor and outdoor options', 'Easy setup', 'Reusable for multiple events', 'Fast 24-hour turnaround'],
      uses: ['Music festivals', 'Corporate events', 'Sporting events', 'Fundraisers', 'Birthday parties', 'Community gatherings'],
      sizes: ['3ft x 5ft', '4ft x 6ft', '4ft x 8ft', '5ft x 10ft', 'Custom sizes available'],
      materials: ['13oz Vinyl', '15oz Vinyl']
    },
    relatedCategories: ['indoor-banners', 'outdoor-banners']
  },
  'custom-banners': {
    slug: 'custom-banners',
    title: 'Custom Banners',
    metaTitle: 'Custom Banners | Design Your Own | Free Next-Day Shipping',
    metaDescription: 'Fully customizable banners for any purpose. Upload your design or create online. Any size, any material. 24-hour production.',
    h1: 'Fully Custom Banners',
    description: 'Create exactly what you need with our fully customizable banners. Upload your own design or use our online design tool to create professional banners for any purpose.',
    keywords: ['custom banners', 'personalized banners', 'design your own banner'],
    canonicalUrl: 'https://bannersonthefly.com/custom-banners',
    ogImage: '/images/logo-social.svg',
    breadcrumbs: [{ name: 'Home', url: '/' }, { name: 'Custom Banners', url: '/custom-banners' }],
    schema: {
      type: 'Product',
      name: 'Custom Banners',
      description: 'Fully customizable banners with online design tool',
      image: '/images/logo-social.svg',
      offers: { price: '29.99', priceCurrency: 'USD', availability: 'https://schema.org/InStock' }
    },
    content: {
      features: ['Upload your own design', 'Online design tool', 'Any size up to 10ft x 50ft', 'Multiple material options', 'Live preview before ordering', 'Professional quality printing'],
      uses: ['Business advertising', 'Personal celebrations', 'Special events', 'Promotional campaigns', 'Directional signage', 'Any custom application'],
      sizes: ['Any size from 1ft x 1ft', 'Up to 10ft x 50ft', 'Custom dimensions', 'Standard sizes available', 'Consult for larger sizes'],
      materials: ['13oz Vinyl', '15oz Vinyl', '18oz Vinyl', 'Mesh Vinyl']
    },
    relatedCategories: ['outdoor-banners', 'indoor-banners']
  },
  'construction-banners': {
    slug: 'construction-banners',
    title: 'Construction Banners',
    metaTitle: 'Construction Banners | Heavy-Duty | Wind-Resistant Options',
    metaDescription: 'Durable construction site banners. Heavy-duty vinyl and mesh options. Weather-resistant. Custom sizes for fencing.',
    h1: 'Heavy-Duty Construction Banners',
    description: 'Built for the toughest job sites, our construction banners withstand harsh weather and heavy use. Available in heavy-duty vinyl or wind-resistant mesh.',
    keywords: ['construction banners', 'construction site banners', 'fence banners'],
    canonicalUrl: 'https://bannersonthefly.com/construction-banners',
    ogImage: '/images/logo-social.svg',
    breadcrumbs: [{ name: 'Home', url: '/' }, { name: 'Construction Banners', url: '/construction-banners' }],
    schema: {
      type: 'Product',
      name: 'Construction Banners',
      description: 'Heavy-duty construction site banners with weather-resistant materials',
      image: '/images/logo-social.svg',
      offers: { price: '38.99', priceCurrency: 'USD', availability: 'https://schema.org/InStock' }
    },
    content: {
      features: ['Heavy-duty 18oz vinyl', 'Wind-resistant mesh option', 'Weather and UV resistant', 'Reinforced grommets', 'Long-lasting durability', 'Custom fence sizes'],
      uses: ['Construction site fencing', 'Job site identification', 'Safety messaging', 'Project advertising', 'Coming soon announcements', 'Developer branding'],
      sizes: ['3ft x 6ft', '4ft x 8ft', '5ft x 10ft', '6ft x 12ft', 'Custom fence sizes'],
      materials: ['18oz Vinyl', 'Mesh Vinyl']
    },
    relatedCategories: ['outdoor-banners']
  }
};

export const getCategoryBySlug = (slug: string): CategorySEO | undefined => {
  return categoryData[slug];
};

export const getAllCategorySlugs = (): string[] => {
  return Object.keys(categoryData);
};
