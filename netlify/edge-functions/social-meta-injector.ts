import type { Context } from "https://edge.netlify.com";

// Blog post metadata
const blogPosts: Record<string, { title: string; description: string; image: string }> = {
  "vinyl-vs-mesh-banners-guide": {
    title: "Vinyl vs. Mesh Banners: Which Is Better for Your Next Project?",
    description: "Choosing between vinyl and mesh banners? Learn the key differences, benefits, and best applications for each material to make the right decision for your project.",
    image: "https://res.cloudinary.com/dtrxl120u/image/upload/v1760799813/unnamed-2_hgwcyw.jpg"
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
  
  // For non-bot traffic or non-blog pages, pass through
  return context.next();
};

export const config = {
  path: "/blog/*"
};
