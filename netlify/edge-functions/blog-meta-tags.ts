import type { Context } from "https://edge.netlify.com";

interface BlogFrontmatter {
  title: string;
  description?: string;
  excerpt?: string;
  heroImage?: string;
  alt?: string;
  canonical?: string;
  slug?: string;
}

// Parse frontmatter from MDX content
function parseFrontmatter(content: string): BlogFrontmatter | null {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---/;
  const match = content.match(frontmatterRegex);
  
  if (!match) return null;
  
  const frontmatterText = match[1];
  const frontmatter: any = {};
  
  // Parse YAML-like frontmatter
  const lines = frontmatterText.split('\n');
  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;
    
    const key = line.substring(0, colonIndex).trim();
    let value = line.substring(colonIndex + 1).trim();
    
    // Remove quotes
    if ((value.startsWith('"') && value.endsWith('"')) || 
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.substring(1, value.length - 1);
    }
    
    frontmatter[key] = value;
  }
  
  return frontmatter as BlogFrontmatter;
}

export default async (request: Request, context: Context) => {
  const url = new URL(request.url);
  
  // Only process blog post URLs
  if (!url.pathname.startsWith('/blog/') || url.pathname === '/blog' || url.pathname === '/blog/') {
    return context.next();
  }
  
  // Extract slug from URL
  const slug = url.pathname.replace('/blog/', '').replace(/\/$/, '');
  
  if (!slug) {
    return context.next();
  }
  
  try {
    // Try to read the MDX file
    const mdxPath = `${Deno.cwd()}/content/blog/${slug}.mdx`;
    let mdxContent: string;
    
    try {
      mdxContent = await Deno.readTextFile(mdxPath);
    } catch {
      // File doesn't exist, let the app handle 404
      return context.next();
    }
    
    // Parse frontmatter
    const frontmatter = parseFrontmatter(mdxContent);
    
    if (!frontmatter) {
      return context.next();
    }
    
    // Get the original response
    const response = await context.next();
    const html = await response.text();
    
    // Prepare meta tag values
    const title = frontmatter.title || 'Blog Post';
    const description = frontmatter.description || frontmatter.excerpt || 'Read this article on Banners on the Fly blog';
    const heroImage = frontmatter.heroImage || 'https://bannersonthefly.com/images/logo-social.svg';
    const canonical = frontmatter.canonical || `https://bannersonthefly.com/blog/${slug}`;
    const alt = frontmatter.alt || title;
    
    // Ensure hero image is absolute URL
    const absoluteHeroImage = heroImage.startsWith('http') 
      ? heroImage 
      : `https://bannersonthefly.com${heroImage}`;
    
    // Replace the default OG tags with blog-specific ones
    let modifiedHtml = html;
    
    // Replace og:title
    modifiedHtml = modifiedHtml.replace(
      /<meta property="og:title" content="[^"]*" \/>/,
      `<meta property="og:title" content="${title}" />`
    );
    
    // Replace og:description
    modifiedHtml = modifiedHtml.replace(
      /<meta property="og:description" content="[^"]*" \/>/,
      `<meta property="og:description" content="${description}" />`
    );
    
    // Replace og:type
    modifiedHtml = modifiedHtml.replace(
      /<meta property="og:type" content="website" \/>/,
      `<meta property="og:type" content="article" />`
    );
    
    // Replace og:url
    modifiedHtml = modifiedHtml.replace(
      /<meta property="og:url" content="[^"]*" \/>/,
      `<meta property="og:url" content="${canonical}" />`
    );
    
    // Replace og:image
    modifiedHtml = modifiedHtml.replace(
      /<meta property="og:image" content="[^"]*" \/>/,
      `<meta property="og:image" content="${absoluteHeroImage}" />`
    );
    
    // Replace og:image:secure_url
    modifiedHtml = modifiedHtml.replace(
      /<meta property="og:image:secure_url" content="[^"]*" \/>/,
      `<meta property="og:image:secure_url" content="${absoluteHeroImage}" />`
    );
    
    // Add og:image:alt if not present
    if (!modifiedHtml.includes('og:image:alt')) {
      modifiedHtml = modifiedHtml.replace(
        /<meta property="og:site_name"/,
        `<meta property="og:image:alt" content="${alt}" />\n    <meta property="og:site_name"`
      );
    }
    
    // Replace Twitter card tags
    modifiedHtml = modifiedHtml.replace(
      /<meta name="twitter:title" content="[^"]*" \/>/,
      `<meta name="twitter:title" content="${title}" />`
    );
    
    modifiedHtml = modifiedHtml.replace(
      /<meta name="twitter:description" content="[^"]*" \/>/,
      `<meta name="twitter:description" content="${description}" />`
    );
    
    modifiedHtml = modifiedHtml.replace(
      /<meta name="twitter:image" content="[^"]*" \/>/,
      `<meta name="twitter:image" content="${absoluteHeroImage}" />`
    );
    
    // Add twitter:image:alt if not present
    if (!modifiedHtml.includes('twitter:image:alt')) {
      modifiedHtml = modifiedHtml.replace(
        /<\/head>/,
        `    <meta name="twitter:image:alt" content="${alt}" />\n  </head>`
      );
    }
    
    // Replace page title
    modifiedHtml = modifiedHtml.replace(
      /<title>[^<]*<\/title>/,
      `<title>${title} - Banners on the Fly Blog</title>`
    );
    
    // Replace meta description
    modifiedHtml = modifiedHtml.replace(
      /<meta name="description" content="[^"]*" \/>/,
      `<meta name="description" content="${description}" />`
    );
    
    return new Response(modifiedHtml, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'public, max-age=0, must-revalidate',
      },
    });
    
  } catch (error) {
    console.error('Error in blog-meta-tags edge function:', error);
    return context.next();
  }
};
