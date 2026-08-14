import type { Context } from "https://edge.netlify.com";

// Static page metadata
const staticPages: Record<string, { title: string; description: string; image: string; url: string; type: string }> = {
  "political-signs": {
    title: "Political Campaign Signs & Banners | Banners On The Fly",
    description: "Fast political campaign signs, banners, and yard signs with free next-day air shipping.",
    image: "https://res.cloudinary.com/dtrxl120u/image/upload/v1778180324/Screenshot_2026-05-07_at_2.58.40_PM_h8ozp5.png?v=2",
    url: "https://bannersonthefly.com/political-signs",
    type: "website"
  }
};

// Blog post metadata
const blogPosts: Record<string, { title: string; description: string; image: string }> = {
  "birthday-banner-size-guide": {
    title: "What Size Birthday Banner Do I Need? A Venue-by-Venue Guide",
    description: "Choose a birthday banner size by measuring the venue, matching it to a dessert table, welcome area, feature wall, or photo setup, and checking hardware.",
    image: "https://bannersonthefly.com/cld-assets/images/blog/birthday-banner-size-guide-v2.webp"
  },
  "garage-sale-yard-sale-banners": {
    title: "Garage Sale Banner Ideas: Wording, Placement, and Directional Signs",
    description: "Plan garage sale banners and directional signs with clearer wording, arrow checks, placement mapping, local-rule review, setup timing, and a teardown checklist.",
    image: "https://bannersonthefly.com/cld-assets/images/blog/garage-sale-yard-sale-banners.webp"
  },
  "car-magnets-vs-vinyl-decals": {
    title: "Car Magnets vs. Vinyl Decals: Which Is Better for Your Vehicle?",
    description: "Compare car magnets vs. vinyl decals by removability, vehicle compatibility, installation, design flexibility, maintenance, and business use before choosing.",
    image: "https://bannersonthefly.com/cld-assets/images/blog/car-magnets-vs-vinyl-decals.webp"
  },
  "now-hiring-banner-ideas": {
    title: "Now Hiring Banner Ideas: What to Say and How to Design It",
    description: "Plan a now hiring banner with clearer wording, readable hierarchy, application instructions, placement guidance, legal checks, examples, and a final checklist.",
    image: "https://bannersonthefly.com/cld-assets/images/blog/now-hiring-banner-ideas.webp"
  },
  "will-car-magnets-stick-to-my-car": {
    title: "Will Car Magnets Stick to Your Vehicle? Test Before You Order",
    description: "Will car magnets stick to your car? Test the exact panel, identify incompatible materials, check contours and repairs, and decide before ordering a sign.",
    image: "https://bannersonthefly.com/cld-assets/images/blog/will-car-magnets-stick-to-my-car-v2.webp"
  },
  "halloween-banner-ideas": {
    title: "Halloween Banner Ideas That Help Guests Find and Enjoy Your Event",
    description: "Explore Halloween banner ideas for stores, schools, churches, and events with clear message formulas, placement plans, design tips, and a final checklist.",
    image: "https://bannersonthefly.com/cld-assets/images/blog/halloween-banner-ideas.webp"
  },
  "standard-yard-sign-size-guide": {
    title: "Standard Yard Sign Size: Is 24×18 Inches Right?",
    description: "Choose the standard yard sign size with practical guidance on 24×18 dimensions, orientation, message fit, stakes, placement, artwork, quantity, and ordering.",
    image: "https://bannersonthefly.com/cld-assets/images/blog/standard-yard-sign-size-guide-v3.webp"
  },
  "banner-wind-slits-guide": {
    title: "Banner Wind Slits: Do They Work—or Weaken the Banner?",
    description: "Learn whether banner wind slits work, how cuts affect vinyl, why mesh differs, and how mounting, inspection, forecasts, and timely removal manage wind risk.",
    image: "https://bannersonthefly.com/cld-assets/images/blog/banner-wind-slits-guide.webp"
  },
  "storefront-banner-size-guide": {
    title: "Storefront Banner Size Guide: Measure Before You Order",
    description: "Choose a storefront banner size by measuring the usable area, viewing distance, door clearances, mounting points, local rules, and message before ordering.",
    image: "https://bannersonthefly.com/cld-assets/images/blog/storefront-banner-size-guide.webp"
  },
  "qr-code-on-banner-guide": {
    title: "QR Codes on Banners: Size, Placement, and Scan-Test Guide",
    description: "Make a QR code banner easier to scan with guidance on size, quiet zones, contrast, placement, file setup, destination checks, security, and field testing.",
    image: "https://bannersonthefly.com/cld-assets/images/blog/qr-code-on-banner-guide.webp"
  },
  "banner-size-for-10x10-canopy": {
    title: "What Size Banner Fits a 10×10 Canopy? A Vendor Setup Guide",
    description: "Choose a banner size for a 10×10 canopy with practical measurements, placement options, mounting checks, artwork guidance, and vendor-booth examples today.",
    image: "https://bannersonthefly.com/cld-assets/images/blog/banner-size-for-10x10-canopy.webp"
  },
  "how-to-clean-vinyl-banner": {
    title: "How to Clean a Vinyl Banner Without Damaging the Print",
    description: "Learn how to clean a vinyl banner safely with mild soap, soft cloths, careful stain testing, a clean rinse, complete drying, and damage checks before storage.",
    image: "https://bannersonthefly.com/cld-assets/images/blog/how-to-clean-vinyl-banner-v2.webp"
  },
  "banner-size-for-6-foot-table": {
    title: "What Size Banner Fits a 6-Foot Table? A Practical Measuring Guide",
    description: "Choose a banner size for a 6-foot table by measuring the usable front, planning the drop, checking hardware, and keeping event artwork readable and clear.",
    image: "https://bannersonthefly.com/cld-assets/images/blog/banner-size-for-6-foot-table-check-in.webp"
  },
  "back-to-school-banners-guide": {
    title: "Back-to-School Banners: A Planning Guide for Welcome, Wayfinding & Events",
    description: "Plan back-to-school banners for entrances, orientations, open houses, and events with practical guidance on wording, size, design, and placement on campus.",
    image: "https://bannersonthefly.com/cld-assets/images/blog/back-to-school-banners-guide.webp"
  },
  "remove-wrinkles-vinyl-banner": {
    title: "How to Remove Wrinkles From a Vinyl Banner Without Damaging It",
    description: "Learn how to remove wrinkles from a vinyl banner safely with flat relaxing, gentle tension, reverse rolling, and storage methods that protect the print.",
    image: "https://bannersonthefly.com/cld-assets/images/blog/remove-wrinkles-vinyl-banner-expo.webp"
  },
  "banner-pole-pocket-size-guide": {
    title: "Banner Pole Pocket Size Guide: Measure the Pole Before You Order",
    description: "Choose a banner pole pocket size by measuring pole diameter, checking clearance, protecting artwork, and planning the sleeve correctly before ordering.",
    image: "https://bannersonthefly.com/cld-assets/images/blog/banner-pole-pocket-size-guide.webp"
  },
  "church-banner-ideas": {
    title: "Church Banner Ideas: A Practical Guide for Welcome, Events & Seasons",
    description: "Explore church banner ideas for welcome, worship, Easter, Christmas, outreach, and wayfinding, with practical guidance on wording, size, design, and setup.",
    image: "https://bannersonthefly.com/cld-assets/images/blog/church-banner-ideas.webp"
  },
  "single-vs-double-sided-yard-signs": {
    title: "Single-Sided vs. Double-Sided Yard Signs: Which Should You Choose?",
    description: "Compare single-sided vs. double-sided yard signs by placement, traffic flow, artwork, arrows, stakes, and costs so every printed side earns attention.",
    image: "https://bannersonthefly.com/cld-assets/images/blog/single-vs-double-sided-yard-signs.webp"
  },
  "keep-car-magnets-from-falling-off": {
    title: "How to Keep Car Magnets From Falling Off: Installation & Care",
    description: "Learn how to keep car magnets from falling off by checking vehicle compatibility, cleaning both surfaces, preventing edge lift, and storing magnets correctly.",
    image: "https://bannersonthefly.com/cld-assets/images/blog/keep-car-magnets-from-falling-off.webp"
  },
  "step-and-repeat-banner-size-guide": {
    title: "Step-and-Repeat Banner Size Guide: Plan a Better Photo Backdrop",
    description: "Choose the right step-and-repeat banner size for portraits, groups, sponsor walls, and venues with practical layout, lighting, artwork, and setup guidance.",
    image: "https://bannersonthefly.com/cld-assets/images/blog/step-and-repeat-banner-size-guide.webp"
  },
  "construction-safety-banners-osha": {
    title: "Construction Safety Banners: Jobsite Messaging & Placement Guide",
    description: "Plan construction safety banners for jobsite rules, PPE reminders, access, traffic flow, and branding without replacing required regulatory signs or controls.",
    image: "https://bannersonthefly.com/cld-assets/images/blog/construction-safety-banners-osha.webp"
  },
  "nonprofit-fundraiser-banners": {
    title: "Fundraiser Banner Ideas: Sponsorship, Wayfinding & Event Signage",
    description: "Explore fundraiser banner ideas for registration, sponsors, donations, wayfinding, finish lines, and photo areas, with practical planning and design tips.",
    image: "https://bannersonthefly.com/cld-assets/images/blog/nonprofit-fundraiser-banners.webp"
  },
  "restaurant-banners-menu-boards": {
    title: "Restaurant Banner Ideas: Menu Boards, Specials & Outdoor Signage",
    description: "Explore restaurant banner ideas for menus, specials, patios, food trucks, and events, with practical advice on messaging, design, placement, and mounting.",
    image: "https://bannersonthefly.com/cld-assets/images/blog/restaurant-banners-menu-boards.webp"
  },
  "school-sports-event-banners": {
    title: "School Sports Banners: A Complete Guide for Senior Night, Sponsors & Game Day",
    description: "Plan school sports banners for senior night, sponsors, schedules, and game day with practical advice on sizes, photos, materials, mounting, and reuse.",
    image: "https://bannersonthefly.com/cld-assets/images/blog/school-sports-event-banners.webp"
  },
  "apartment-property-management-banners": {
    title: "Apartment Leasing Banners: A Property Manager’s Planning Guide",
    description: "Plan apartment leasing banners that attract prospects, guide tours, promote amenities, and support property operations with practical design and placement tips.",
    image: "https://bannersonthefly.com/cld-assets/images/blog/apartment-property-management-banners.webp"
  },
  "real-estate-open-house-banners": {
    title: "Open House Banners and Yard Signs: A Complete Planning Guide",
    description: "Plan effective open house banners and yard signs with practical guidance on messaging, placement, readable design, directional flow, safety, and reuse.",
    image: "https://bannersonthefly.com/cld-assets/images/blog/real-estate-open-house-banners.webp"
  },
  "color-accuracy-cmyk-banners": {
    title: "CMYK Banner Printing: How to Get More Predictable Color",
    description: "Prepare color for CMYK banner printing with practical advice on RGB conversion, brand colors, profiles, black, gradients, file checks, and expectations.",
    image: "https://bannersonthefly.com/cld-assets/images/blog/color-accuracy-cmyk-banners.webp"
  },
  "outdoor-banner-durability-guide": {
    title: "How Long Do Outdoor Banners Last? A Durability and Care Guide",
    description: "Learn what affects outdoor banner durability, how material, wind, mounting, sun, and storage change performance, and when to inspect or replace a banner.",
    image: "https://bannersonthefly.com/cld-assets/images/blog/outdoor-banner-durability-guide.webp"
  },
  "trade-show-banner-sizes-guide": {
    title: "Trade Show Banner Sizes: A Practical Guide for 10×10 and 10×20 Booths",
    description: "Choose trade show banner sizes for 10×10 and 10×20 booths with practical layouts, viewing-distance guidance, setup checks, artwork tips, and planning advice.",
    image: "https://bannersonthefly.com/cld-assets/images/blog/trade-show-banner-sizes-guide.webp"
  },
  "banner-design-readability-tips": {
    title: "How to Make a Banner Readable From 10, 20, or 50 Feet",
    description: "Learn how to make a banner readable from 10, 20, or 50 feet with practical guidance on letter size, contrast, hierarchy, copy, and distance testing today.",
    image: "https://bannersonthefly.com/cld-assets/images/blog/banner-design-readability-tips.webp"
  },
  "grommets-pole-pockets-hemming-guide": {
    title: "Banner Grommets vs. Pole Pockets vs. Rope: Which Finish Should You Choose?",
    description: "Compare banner grommets, pole pockets, rope hems, and standard hemming to match the right finish to your mounting plan, hardware, and display needs today.",
    image: "https://bannersonthefly.com/cld-assets/images/blog/grommets-pole-pockets-hemming-guide-v2.webp"
  },
  "car-magnet-size-guide": {
    title: "Car Magnet Size Guide: Choose the Right Fit for Your Vehicle",
    description: "Use this car magnet size guide to choose the right dimensions, placement, artwork, and care for a clean, readable magnetic vehicle sign that fits well.",
    image: "https://bannersonthefly.com/cld-assets/images/blog/car-magnet-size-guide-v2.webp"
  },
  "grand-opening-banner-ideas": {
    title: "Grand Opening Banner Ideas: A Complete Planning & Design Guide",
    description: "Explore grand opening banner ideas, messaging, sizes, placement, materials, and a practical launch checklist for a storefront people can find quickly.",
    image: "https://bannersonthefly.com/cld-assets/images/blog/grand-opening-banner-ideas-v2.webp"
  },
  "print-ready-banner-artwork-guide": {
    title: "Print-Ready Banner Artwork: The Complete File Setup Checklist",
    description: "Learn how to prepare print-ready banner artwork: dimensions, resolution, file formats, fonts, color, safe areas, and a final pre-upload checklist today.",
    image: "https://bannersonthefly.com/cld-assets/images/blog/print-ready-banner-artwork-guide-v2.webp"
  },
  "13oz-vs-15oz-vs-18oz-vinyl-banner-guide": {
    title: "13 oz vs. 15 oz vs. 18 oz Vinyl Banners: Which Should You Choose?",
    description: "Compare 13 oz, 15 oz, and 18 oz vinyl banners by durability, rigidity, portability, and best use so you can choose the right material confidently today.",
    image: "https://bannersonthefly.com/cld-assets/images/blog/13oz-vs-15oz-vs-18oz-vinyl-banner-guide.webp"
  },
  "danos-seasoning-banner-success-story": {
    title: "From Flea Markets to Food Festivals: How Dano's Seasoning Grew with the Right Banners",
    description: "Discover how Dano's Seasoning went from flea market vendor to national brand with the help of quality banners. A 30-year partnership story that proves great signage makes a difference.",
    image: "https://res.cloudinary.com/dtrxl120u/image/upload/v1760662241/uploads/2019-07-19_10-03-03_wcrugm.png"
  },
  "vinyl-vs-mesh-banners-guide": {
    title: "Vinyl vs. Mesh Banners: Which Is Better for Your Next Project?",
    description: "Choosing between vinyl and mesh banners? Learn the key differences, benefits, and best applications for each material to make the right decision for your project.",
    image: "https://res.cloudinary.com/dtrxl120u/image/upload/v1760799813/unnamed-2_hgwcyw.jpg"
  },
  "perfect-banner-size-guide": {
    title: "How to Choose the Perfect Banner Size for Your Event or Business",
    description: "Learn how to choose the perfect banner size for your event or business. Expert tips on viewing distance, location, orientation, and design for maximum visibility and impact.",
    image: "https://res.cloudinary.com/dtrxl120u/image/upload/v1760812399/Screenshot_2025-10-18_at_11.50.45_AM_ekmtxm.png"
  },
  "banner-installation-hanging-guide": {
    title: "Installation 101: The Best Ways to Hang Your Vinyl Banner for Maximum Visibility and Longevity",
    description: "Properly hanging your banner is key to ensuring it has maximum visibility and stays looking professional for its full lifespan. Learn the best methods for indoor and outdoor installation.",
    image: "https://res.cloudinary.com/dtrxl120u/image/upload/v1761249110/hanging_banner_gvkxbx.jpg"
  },
  "the-power-of-physical-marketing-in-a-digital-world": {
    title: "The Power of Physical Marketing in a Digital World",
    description: "Discover why physical marketing—banners, signage, and packaging—still outperforms digital ads for attention, trust, and real-world brand impact.",
    image: "https://res.cloudinary.com/dtrxl120u/image/upload/v1762185431/dano_banner_example_xstuy9.png"
  }
};

// User agents that need pre-rendered meta tags
const botUserAgents = [
  'facebookexternalhit',
  'Facebot',
  'Twitterbot',
  'LinkedInBot',
  'Slackbot',
  'WhatsApp',
  'TelegramBot',
  'Discordbot',
  'Googlebot',
  'bingbot',
  'Slurp',
  'DuckDuckBot',
  'Baiduspider',
  'YandexBot',
  'Sogou',
  'Exabot',
  'ia_archiver',
  'AppleBot',
  'Applebot',
  'iPhone',
  'iPad',
  'iPod',
  'Macintosh'
];

function isBot(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  return botUserAgents.some(bot => ua.includes(bot.toLowerCase()));
}

function injectStaticPageMetaTags(html: string, key: string): string {
  const page = staticPages[key];
  if (!page) return html;

  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  if (!headMatch) return html;

  let headContent = headMatch[1];

  headContent = headContent
    .replace(/<meta[^>]*property="og:[^"]*"[^>]*>/gi, '')
    .replace(/<meta[^>]*name="twitter:[^"]*"[^>]*>/gi, '')
    .replace(/<meta[^>]*name="description"[^>]*>/gi, '')
    .replace(/<title>[^<]*<\/title>/gi, '');

  const newMetaTags = `
    <title>${page.title} | Banners On The Fly</title>
    <meta name="description" content="${page.description}">
    <meta property="og:type" content="${page.type}">
    <meta property="og:url" content="${page.url}">
    <meta property="og:title" content="${page.title}">
    <meta property="og:description" content="${page.description}">
    <meta property="og:image" content="${page.image}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:site_name" content="Banners On The Fly">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:url" content="${page.url}">
    <meta name="twitter:title" content="${page.title}">
    <meta name="twitter:description" content="${page.description}">
    <meta name="twitter:image" content="${page.image}">
  `;

  const newHead = `<head>${headContent}${newMetaTags}</head>`;
  return html.replace(/<head[^>]*>[\s\S]*?<\/head>/i, newHead);
}

function injectMetaTags(html: string, slug: string): string {
  const post = blogPosts[slug];
  if (!post) return html;

  const url = `https://bannersonthefly.com/blog/${slug}`;
  
  // Extract the head section
  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  if (!headMatch) return html;
  
  let headContent = headMatch[1];
  
  // Remove all existing og:, twitter:, title, description meta tags, and apple-touch-icon
  headContent = headContent
    .replace(/<meta[^>]*property="og:[^"]*"[^>]*>/gi, '')
    .replace(/<meta[^>]*name="twitter:[^"]*"[^>]*>/gi, '')
    .replace(/<meta[^>]*name="description"[^>]*>/gi, '')
    .replace(/<title>[^<]*<\/title>/gi, '')
    .replace(/<link[^>]*rel="apple-touch-icon"[^>]*>/gi, '');
  
  // Add the new meta tags at the end of head content
  const newMetaTags = `
    <title>${post.title} - Banners on the Fly Blog</title>
    <meta name="description" content="${post.description}">
    <link rel="apple-touch-icon" href="${post.image}">
    <meta property="og:type" content="article">
    <meta property="og:url" content="${url}">
    <meta property="og:title" content="${post.title}">
    <meta property="og:description" content="${post.description}">
    <meta property="og:image" content="${post.image}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:site_name" content="Banners on the Fly">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:url" content="${url}">
    <meta name="twitter:title" content="${post.title}">
    <meta name="twitter:description" content="${post.description}">
    <meta name="twitter:image" content="${post.image}">
  `;
  
  // Reconstruct the head section
  const newHead = `<head>${headContent}${newMetaTags}</head>`;
  
  // Replace the old head with the new one
  return html.replace(/<head[^>]*>[\s\S]*?<\/head>/i, newHead);
}

export default async (request: Request, context: Context) => {
  const url = new URL(request.url);
  const userAgent = request.headers.get('user-agent') || '';
  
  // Check if this is a blog post URL
  const blogMatch = url.pathname.match(/^\/blog\/([^\/]+)$/);
  
  // Check if this is a static page with custom meta
  const staticPageKey = Object.keys(staticPages).find(key => url.pathname === `/${key}`);

  if (blogMatch && isBot(userAgent)) {
    const slug = blogMatch[1];
    
    // Fetch the original HTML
    const response = await context.next();
    const html = await response.text();
    
    // Inject meta tags
    const modifiedHtml = injectMetaTags(html, slug);
    
    return new Response(modifiedHtml, {
      headers: {
        'content-type': 'text/html',
        'cache-control': 'no-cache, no-store, must-revalidate'
      }
    });
  }

  if (staticPageKey && isBot(userAgent)) {
    const key = staticPageKey;
    
    const response = await context.next();
    const html = await response.text();
    
    const modifiedHtml = injectStaticPageMetaTags(html, key);
    
    return new Response(modifiedHtml, {
      headers: {
        'content-type': 'text/html',
        'cache-control': 'no-cache, no-store, must-revalidate'
      }
    });
  }
  
  // For non-bot traffic or non-matching pages, pass through
  return context.next();
};
