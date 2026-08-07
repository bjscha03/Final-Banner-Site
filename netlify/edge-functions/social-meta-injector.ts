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
    image: "https://bannersonthefly.com/cld-assets/images/blog/grommets-pole-pockets-hemming-guide.webp"
  },
  "car-magnet-size-guide": {
    title: "Car Magnet Size Guide: Choose the Right Fit for Your Vehicle",
    description: "Use this car magnet size guide to choose the right dimensions, placement, artwork, and care for a clean, readable magnetic vehicle sign that fits well.",
    image: "https://bannersonthefly.com/cld-assets/images/blog/car-magnet-size-guide.webp"
  },
  "grand-opening-banner-ideas": {
    title: "Grand Opening Banner Ideas: A Complete Planning & Design Guide",
    description: "Explore grand opening banner ideas, messaging, sizes, placement, materials, and a practical launch checklist for a storefront people can find quickly.",
    image: "https://bannersonthefly.com/cld-assets/images/blog/grand-opening-banner-ideas.webp"
  },
  "print-ready-banner-artwork-guide": {
    title: "Print-Ready Banner Artwork: The Complete File Setup Checklist",
    description: "Learn how to prepare print-ready banner artwork: dimensions, resolution, file formats, fonts, color, safe areas, and a final pre-upload checklist today.",
    image: "https://bannersonthefly.com/cld-assets/images/blog/print-ready-banner-artwork-guide.webp"
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
