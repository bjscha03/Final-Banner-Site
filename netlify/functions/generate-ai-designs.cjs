const OpenAI = require('openai');
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Convert hex color to descriptive color name
function hexToColorName(hex) {
  // Normalize hex color
  hex = hex.toUpperCase().replace('#', '');
  
  // Parse RGB values
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  
  // Calculate HSL for better color description
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;
  
  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const lightness = (max + min) / 2;
  
  // Determine if color is light, dark, or medium
  let brightness = '';
  if (lightness > 0.8) brightness = 'very light ';
  else if (lightness > 0.6) brightness = 'light ';
  else if (lightness < 0.2) brightness = 'very dark ';
  else if (lightness < 0.4) brightness = 'dark ';
  
  // Determine saturation
  let saturation = '';
  if (max !== min) {
    const s = lightness > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
    if (s > 0.8) saturation = 'vibrant ';
    else if (s > 0.5) saturation = 'rich ';
    else if (s < 0.2) saturation = 'muted ';
  }
  
  // Determine base color
  let colorName = '';
  
  // Check for grayscale
  if (Math.abs(r - g) < 10 && Math.abs(g - b) < 10 && Math.abs(r - b) < 10) {
    if (lightness > 0.95) return 'white';
    if (lightness < 0.05) return 'black';
    if (lightness > 0.7) return 'light gray';
    if (lightness < 0.3) return 'dark gray';
    return 'gray';
  }
  
  // Determine hue
  let hue = 0;
  if (max !== min) {
    if (max === rNorm) {
      hue = ((gNorm - bNorm) / (max - min)) % 6;
    } else if (max === gNorm) {
      hue = (bNorm - rNorm) / (max - min) + 2;
    } else {
      hue = (rNorm - gNorm) / (max - min) + 4;
    }
    hue = Math.round(hue * 60);
    if (hue < 0) hue += 360;
  }
  
  // Map hue to color name
  if (hue >= 345 || hue < 15) colorName = 'red';
  else if (hue >= 15 && hue < 45) colorName = 'orange';
  else if (hue >= 45 && hue < 70) colorName = 'yellow';
  else if (hue >= 70 && hue < 150) colorName = 'green';
  else if (hue >= 150 && hue < 200) colorName = 'cyan';
  else if (hue >= 200 && hue < 260) colorName = 'blue';
  else if (hue >= 260 && hue < 300) colorName = 'purple';
  else if (hue >= 300 && hue < 345) colorName = 'magenta';
  
  return `${brightness}${saturation}${colorName}`.trim();
}

// Build a strict flat-print-artwork prompt. The banner generation pipeline
// must produce the actual print file (edge-to-edge artwork) — never a
// product mockup with the banner hanging on a stand inside a room.
function enhancePrompt(prompt, styles = [], colors = [], size) {
  const aspect = size && size.wIn && size.hIn ? `${size.wIn}:${size.hIn}` : '';

  let header =
    `Create a flat 2D print-ready vinyl banner design.\n` +
    `This is NOT a product mockup. The image IS the final print file (the actual artwork sent to the printer).\n` +
    (aspect ? `Aspect ratio: ${aspect} EXACT.\n` : '') +
    `\n` +
    `Positive requirements:\n` +
    `- Fill the ENTIRE canvas edge-to-edge with the printed design — no margins, no padding, no outer background, no mockup framing.\n` +
    `- Extremely bold, simple layout with high contrast colors readable from a distance.\n` +
    `- One main headline rendered very large; optional short subheadline.\n` +
    `- Generate ONLY one cohesive composition per image.\n` +
    `- Solid colored or fully designed background that fills 100% of the canvas.\n` +
    `\n` +
    `Do NOT show (hard fail):\n` +
    `- NO banner hanging, mounted, or displayed as a physical object in space.\n` +
    `- NO walls, floors, rooms, indoor or outdoor scenes around the artwork.\n` +
    `- NO stands, X-stands, easels, tripods, poles, ropes, chains, hooks.\n` +
    `- NO grommets, eyelets, metal rings, holes, stakes, screws, mounting hardware.\n` +
    `- NO shadows cast by the banner, NO drop shadow under the artwork.\n` +
    `- NO perspective, tilt, angle, or 3D look — render perfectly flat, head-on, 0° rotation.\n` +
    `- NO lighting environment, studio lighting, ambient gradients, or vignette.\n` +
    `- NO gray or neutral studio background, NO empty padding around the design.\n` +
    `- NO frame around the artwork, NO product photo, NO design-inside-a-design.\n` +
    `- NO presentation sheets, NO concept boards, NO side-by-side variants, NO multiple compositions in one image.\n` +
    `- NO tiny text, NO lorem ipsum, NO unreadable micro-text, NO decorative clutter.\n`;

  let userBlock = `\nUser request (the actual artwork to design):\n${prompt}\n`;

  if (styles && styles.length > 0) {
    const styleDescriptions = {
      'corporate': 'clean, professional, business-appropriate, polished',
      'kid-friendly': 'colorful, playful, fun, child-appropriate, cheerful, bright',
      'elegant': 'sophisticated, refined, luxurious, classy, upscale',
      'modern': 'contemporary, sleek, minimalist, cutting-edge',
      'vintage': 'retro, classic, nostalgic, timeless',
      'playful': 'fun, energetic, vibrant, lively, dynamic',
      'minimalist': 'clean, simple, uncluttered, spacious',
      'bold': 'striking, dramatic, eye-catching, powerful',
      'minimal': 'simple, understated, clean lines, uncluttered',
      'retro': 'vintage, nostalgic, classic, throwback',
      'seasonal': 'timely, festive, appropriate for the season'
    };
    const styleText = styles.map(style => styleDescriptions[style] || style).join(', ');
    userBlock += `Style: ${styleText}.\n`;
  }

  if (colors && colors.length > 0) {
    const colorNames = colors.map(color => hexToColorName(color));
    const uniqueColors = [...new Set(colorNames)];
    userBlock += `Color palette: prominently featuring ${uniqueColors.join(', ')} as the dominant colors throughout the design.\n`;
  }

  return header + userBlock;
}

async function uploadToCloudinary(imageUrl, index) {
  try {
    console.log(`[AI-Gen] Uploading image ${index} to Cloudinary from URL: ${imageUrl}`);
    const uploadStart = Date.now();
    
    const result = await cloudinary.uploader.upload(imageUrl, {
      folder: 'ai-generated-banners',
      public_id: `banner-${Date.now()}-${index}`,
      resource_type: 'image',
      timeout: 60000 // 60 second timeout for upload
    });
    
    const uploadTime = Date.now() - uploadStart;
    console.log(`[AI-Gen] Successfully uploaded image ${index} to Cloudinary in ${uploadTime}ms: ${result.secure_url}`);
    
    return {
      url: result.secure_url,
      cloudinary_public_id: result.public_id,
      width: result.width,
      height: result.height
    };
  } catch (error) {
    console.error(`[AI-Gen] ========================================`);
    console.error(`[AI-Gen] CLOUDINARY UPLOAD ERROR (image ${index})`);
    console.error(`[AI-Gen] ========================================`);
    console.error(`[AI-Gen] Error object:`, error);
    console.error(`[AI-Gen] Error message:`, error.message);
    console.error(`[AI-Gen] Error name:`, error.name);
    console.error(`[AI-Gen] Error stack:`, error.stack);
    console.error(`[AI-Gen] ========================================`);
    throw new Error(`Failed to upload image ${index} to Cloudinary: ${error.message || JSON.stringify(error)}`);
  }
}

async function generateSingleImage(openai, prompt, dalleSize, index) {
  try {
    const genStart = Date.now();
    console.log(`[AI-Gen] Generating variation ${index + 1} with gpt-image-1...`);
    console.log(`[AI-Gen] Prompt for variation ${index + 1}: ${prompt}`);
    
    const response = await openai.images.generate({
      model: 'gpt-image-1',
      prompt: prompt,
      n: 1,
      size: dalleSize,
      quality: 'high'
    });
    
    const genTime = Date.now() - genStart;
    const image = response.data?.[0] || {};
    const imageUrl = image.url || (image.b64_json ? `data:image/png;base64,${image.b64_json}` : null);
    if (!imageUrl) { throw new Error('OpenAI returned no image URL or base64 payload.'); }
    console.log(`[AI-Gen] Generated image ${index + 1} in ${genTime}ms: ${imageUrl}`);
    
    // Upload to Cloudinary
    const cloudinaryResult = await uploadToCloudinary(imageUrl, index);
    
    const totalTime = Date.now() - genStart;
    console.log(`[AI-Gen] Successfully processed image ${index + 1} in ${totalTime}ms total`);
    
    return cloudinaryResult;
  } catch (error) {
    console.error(`[AI-Gen] ========================================`);
    console.error(`[AI-Gen] ERROR in generateSingleImage (variation ${index + 1})`);
    console.error(`[AI-Gen] ========================================`);
    console.error(`[AI-Gen] Error object:`, error);
    console.error(`[AI-Gen] Error message:`, error.message);
    console.error(`[AI-Gen] Error name:`, error.name);
    console.error(`[AI-Gen] Error stack:`, error.stack);
    if (error.response) {
      console.error(`[AI-Gen] Error response:`, error.response);
      console.error(`[AI-Gen] Error response data:`, error.response.data);
      console.error(`[AI-Gen] Error response status:`, error.response.status);
    }
    if (error.error) {
      console.error(`[AI-Gen] OpenAI error object:`, error.error);
    }
    console.error(`[AI-Gen] ========================================`);
    throw new Error(`Failed to generate image ${index + 1}: ${error.message || JSON.stringify(error)}`);
  }
}

// ISSUE #2 FIX: Parallel generation with detailed timing
async function generateWithDallE(prompt, size, variations = 3) {
  const totalStart = Date.now();
  
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
  
  // Calculate dimensions at 150 DPI for print quality
  const widthPx = Math.round(size.wIn * 150);
  const heightPx = Math.round(size.hIn * 150);
  
  const aspect = size.wIn / size.hIn;
  const dalleSize = aspect >= 1 ? '1536x1024' : '1024x1536';
  
  console.log(`[AI-Gen] ========================================`);
  console.log(`[AI-Gen] Starting parallel generation of ${variations} images`);
  console.log(`[AI-Gen] Target size: ${widthPx}x${heightPx}px (${size.wIn}x${size.hIn} inches at 150 DPI)`);
  console.log(`[AI-Gen] DALL-E size: ${dalleSize}`);
  console.log(`[AI-Gen] ========================================`);
  
  // Generate all images in parallel (ISSUE #2 FIX)
  const imagePromises = [];
  for (let i = 0; i < variations; i++) {
    imagePromises.push(generateSingleImage(openai, `${prompt}

Variation seed ${i+1}: keep concept consistent while producing a distinct composition.`, dalleSize, i));
  }
  
  // Wait for all images to complete
  const images = await Promise.all(imagePromises);
  
  const totalTime = Date.now() - totalStart;
  console.log(`[AI-Gen] ========================================`);
  console.log(`[AI-Gen] Successfully generated and uploaded all ${variations} images`);
  console.log(`[AI-Gen] Total time: ${totalTime}ms (${(totalTime / 1000).toFixed(1)}s)`);
  console.log(`[AI-Gen] Average per image: ${(totalTime / variations).toFixed(0)}ms`);
  console.log(`[AI-Gen] ========================================`);
  
  return images;
}

const { neon } = require('@neondatabase/serverless');

async function assertAdminAccess(userEmail) {
  if (!userEmail) return false;
  const dbUrl = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL;
  if (!dbUrl) return false;
  const sql = neon(dbUrl);
  // Resolve the actual admin column from the live `profiles` table.
  const columns = await sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
  `;
  const available = new Set(columns.map((c) => c.column_name));

  if (available.has('is_admin')) {
    const rows = await sql`SELECT is_admin FROM profiles WHERE email = ${userEmail} LIMIT 1`;
    return rows.length > 0 && rows[0].is_admin === true;
  }

  if (available.has('role')) {
    const rows = await sql`SELECT role FROM profiles WHERE email = ${userEmail} LIMIT 1`;
    return rows.length > 0 && String(rows[0].role || '').toLowerCase() === 'admin';
  }

  if (available.has('user_role')) {
    const rows = await sql`SELECT user_role FROM profiles WHERE email = ${userEmail} LIMIT 1`;
    return rows.length > 0 && String(rows[0].user_role || '').toLowerCase() === 'admin';
  }

  if (available.has('account_type')) {
    const rows = await sql`SELECT account_type FROM profiles WHERE email = ${userEmail} LIMIT 1`;
    return rows.length > 0 && String(rows[0].account_type || '').toLowerCase() === 'admin';
  }

  throw new Error('No supported admin field found on public.profiles (expected is_admin/role/user_role/account_type).');
}

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const body = JSON.parse(event.body);
    const { prompt, styles = [], colors = [], size, userEmail, productType, width, height, material, inspirationImage } = body;
    const variations = 3;

    console.log('[AI-Gen] ========================================');
    console.log('[AI-Gen] AI Banner Generation Request');
    console.log('[AI-Gen] ========================================');
    console.log('[AI-Gen] Raw prompt:', prompt);
    console.log('[AI-Gen] Product context:', { productType, width, height, material, hasInspiration: !!inspirationImage });
    console.log('[AI-Gen] Prompt length:', prompt ? prompt.length : 0);
    console.log('[AI-Gen] Styles:', styles);
    console.log('[AI-Gen] Colors:', colors);
    console.log('[AI-Gen] Size:', size);
    
    // DIAGNOSTIC: Check environment variables
    console.log('[AI-Gen] ========================================');
    console.log('[AI-Gen] Environment Variables Check');
    console.log('[AI-Gen] ========================================');
    console.log('[AI-Gen] OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? `SET (${process.env.OPENAI_API_KEY.substring(0, 10)}...)` : '❌ NOT SET');
    console.log('[AI-Gen] CLOUDINARY_CLOUD_NAME:', process.env.CLOUDINARY_CLOUD_NAME || '❌ NOT SET');
    console.log('[AI-Gen] CLOUDINARY_API_KEY:', process.env.CLOUDINARY_API_KEY ? '✅ SET' : '❌ NOT SET');
    console.log('[AI-Gen] CLOUDINARY_API_SECRET:', process.env.CLOUDINARY_API_SECRET ? '✅ SET' : '❌ NOT SET');
    console.log('[AI-Gen] ========================================');

    const isProduction = process.env.CONTEXT === 'production' || process.env.NODE_ENV === 'production';
    const isAdmin = userEmail ? await assertAdminAccess(userEmail) : false;
    if (isProduction && !isAdmin) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Admin access required in production' }) };
    }

    // ISSUE #4 FIX: Better validation and error messages
    if (!prompt || typeof prompt !== 'string') {
      console.error('[AI-Gen] Invalid prompt:', prompt);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Prompt is required',
          details: 'Please provide a valid text prompt'
        })
      };
    }

    const trimmedPrompt = prompt.trim();
    if (trimmedPrompt.length === 0) {
      console.error('[AI-Gen] Empty prompt after trimming');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Prompt cannot be empty',
          details: 'Please describe what you want to generate'
        })
      };
    }

    if (!size || !size.wIn || !size.hIn) {
      console.error('[AI-Gen] Invalid size:', size);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Size with wIn and hIn is required',
          details: 'Banner dimensions are missing'
        })
      };
    }

    // Check for OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      console.error('[AI-Gen] OpenAI API key not configured');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'OpenAI API key not configured',
          details: 'Please set OPENAI_API_KEY environment variable in Netlify'
        })
      };
    }

    // Check for Cloudinary credentials
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      console.error('[AI-Gen] Cloudinary credentials not configured');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'Cloudinary not configured',
          details: 'Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET environment variables in Netlify'
        })
      };
    }

    const printPrompt = `${trimmedPrompt}

Hidden premium art direction (must follow): professional large-format ${productType || 'banner'} optimized for vinyl printing; bold readable typography; cinematic yet clean commercial composition; high contrast; strong hierarchy; realistic print-ready execution; clean spacing; trade-show marketing quality; print-safe margins; avoid edge collisions; use uploaded inspiration as branding/style reference only; create original artwork; keep exact ${width || size?.wIn}:${height || size?.hIn} aspect ratio and fill full canvas.`;
    const enhancedPrompt = enhancePrompt(printPrompt, styles, colors, size);
    console.log('[AI-Gen] Enhanced prompt:', enhancedPrompt);
    console.log('[AI-Gen] Enhanced prompt length:', enhancedPrompt.length);
    console.log('[AI-Gen] Starting parallel image generation...');
    
    const images = await generateWithDallE(enhancedPrompt, size, variations);
    if (!Array.isArray(images) || images.length !== 3) {
      throw new Error(`Expected exactly 3 images but received ${Array.isArray(images) ? images.length : 'none'}`);
    }
    
    console.log('[AI-Gen] ========================================');
    console.log('[AI-Gen] Generation Complete');
    console.log('[AI-Gen] Generated images:', images.length);
    console.log('[AI-Gen] Image URLs:', images.map(img => img.url));
    console.log('[AI-Gen] Cloudinary IDs:', images.map(img => img.cloudinary_public_id));
    console.log('[AI-Gen] ========================================');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        images: images,
        prompt: enhancedPrompt,
        metadata: {
          model: 'gpt-image-1',
          variations: variations,
          quality: 'high'
        }
      })
    };

  } catch (error) {
    console.error('[AI-Gen] ========================================');
    console.error('[AI-Gen] Handler Error');
    console.error('[AI-Gen] ========================================');
    console.error('[AI-Gen] Error:', error);
    console.error('[AI-Gen] Error message:', error.message);
    console.error('[AI-Gen] Error stack:', error.stack);
    console.error('[AI-Gen] ========================================');
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to generate images',
        details: error.message,
        type: error.name
      })
    };
  }
};
