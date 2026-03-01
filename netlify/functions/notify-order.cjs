const { neon } = require('@neondatabase/serverless');

// Generate a thumbnail URL from various image sources
// Uses Cloudinary's URL transformation to resize images for email display
function getThumbnailUrl(item, maxWidth = 300) {
  // PRIORITY: Use thumbnail_url first - it contains the accurately rendered design
  // with correct image positioning, overlays, text elements, and grommets baked in
  if (item.thumbnail_url) {
    const thumbUrl = item.thumbnail_url;
    // Apply Cloudinary transformation for sizing if it is a Cloudinary URL
    if (thumbUrl.includes("res.cloudinary.com") && thumbUrl.includes("/upload/")) {
      return thumbUrl.replace("/upload/", "/upload/w_" + maxWidth + ",c_limit,f_auto,q_auto/");
    }
    // For other URLs, use Cloudinary fetch to resize
    if (thumbUrl.startsWith("http") && !thumbUrl.includes("res.cloudinary.com")) {
      return "https://res.cloudinary.com/dtrxl120u/image/fetch/w_" + maxWidth + ",c_limit,f_auto,q_auto/" + thumbUrl;
    }
    return thumbUrl;
  }

  // Fallback: Priority order for legacy orders without thumbnail_url:
  
  let imageUrl = null;
  
  if (item.web_preview_url) {
    imageUrl = item.web_preview_url;
  } else if (item.print_ready_url) {
    imageUrl = item.print_ready_url;
  } else if (item.overlay_image?.fileKey) {
    // Convert Cloudinary public ID to URL
    const fileKey = item.overlay_image.fileKey;
    if (fileKey.startsWith('http')) {
      imageUrl = fileKey;
    } else {
      // Assume it's a Cloudinary public ID
      imageUrl = `https://res.cloudinary.com/dtrxl120u/image/upload/${fileKey}`;
    }
  } else if (item.file_key) {
    const fileKey = item.file_key;
    if (fileKey.startsWith('http')) {
      imageUrl = fileKey;
    } else {
      // Assume it's a Cloudinary public ID
      imageUrl = `https://res.cloudinary.com/dtrxl120u/image/upload/${fileKey}`;
    }
  }
  
  if (!imageUrl) return null;
  
  // Apply Cloudinary transformation for thumbnail sizing
  // Insert width transformation into Cloudinary URL
  if (imageUrl.includes('res.cloudinary.com') && imageUrl.includes('/upload/')) {
    // Insert transformation after /upload/
    return imageUrl.replace('/upload/', `/upload/w_${maxWidth},c_limit,f_auto,q_auto/`);
  }
  
  // For fetch URLs, wrap in Cloudinary fetch
  if (imageUrl.startsWith('http') && !imageUrl.includes('res.cloudinary.com')) {
    return `https://res.cloudinary.com/dtrxl120u/image/fetch/w_${maxWidth},c_limit,f_auto,q_auto/${imageUrl}`;
  }
  
  return imageUrl;
}

// Email-compatible logo header HTML

// Email-compatible logo header HTML
function createEmailLogoHeader() {
  const logoUrl = 'https://res.cloudinary.com/dtrxl120u/image/fetch/f_auto,q_auto,w_300/https://bannersonthefly.com/cld-assets/images/logo-compact.svg';
  
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 0; padding: 0;">
      <tr>
        <td style="padding: 20px 0 30px 0; text-align: center; background-color: #ffffff;">
          <img src="${logoUrl}" 
               alt="Banners on the Fly - Custom Banner Printing" 
               width="200" 
               height="auto" 
               style="display: block; margin: 0 auto; max-width: 100%; height: auto; border: 0;" />
        </td>
      </tr>
    </table>
  `;
}

// Email container wrapper with proper email client compatibility
function createEmailContainer(content) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
      <!--[if !mso]><!-->
      <meta http-equiv="X-UA-Compatible" content="IE=edge">
      <!--<![endif]-->
      <title>Banners on the Fly</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; line-height: 1.6; color: #333333; background-color: #f4f4f4;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 0; padding: 0; background-color: #f4f4f4;">
        <tr>
          <td style="padding: 20px 0;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);" align="center">
              <tr>
                <td>
                  ${createEmailLogoHeader()}
                  ${content}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

// Create improved admin order email HTML matching AdminOrderNotification.tsx design
function createAdminOrderEmailHtml(payload) {
  const order = payload.order;
  const invoiceUrl = payload.invoiceUrl;
  const logoUrl = 'https://res.cloudinary.com/dtrxl120u/image/fetch/f_auto,q_auto,w_300/https://bannersonthefly.com/cld-assets/images/logo-compact.svg';

  // Format date
  const formattedDate = order.created_at
    ? new Date(order.created_at).toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/New_York'
      })
    : new Date().toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/New_York'
      });

  // Calculate totals
  const total = order.total ?? (order.totalCents || 0) / 100;
  const subtotal = order.subtotal ?? (order.subtotalCents || 0) / 100;
  const tax = order.tax ?? (order.taxCents || 0) / 100;

  // Discount info from order (best-discount-wins logic applied at checkout)
  const discountCents = order.applied_discount_cents || 0;
  const discountDollars = discountCents / 100;
  const discountLabel = order.applied_discount_label || '';
  const discountType = order.applied_discount_type || 'none';

  // Check if any items have design service enabled
  const hasDesignService = order.items.some(item => item.design_service_enabled);

  // Generate items HTML
  const itemsHtml = order.items.map(item => `
    <tr>
      <td style="padding: 16px; border-bottom: 1px solid #f3f4f6;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
          <tr>
            ${item.thumbnailUrl ? `
            <td style="width: 80px; vertical-align: top; padding-right: 16px;">
              <img src="${item.thumbnailUrl}" alt="Banner" width="80" style="border-radius: 6px; border: 1px solid #e5e7eb; display: block;" />
            </td>
            ` : ''}
            <td style="vertical-align: top;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="font-size: 15px; font-weight: 600; color: #1f2937; padding-bottom: 4px;">${item.name}</td>
                  <td style="font-size: 15px; font-weight: 700; color: #059669; text-align: right;">$${(item.price || 0).toFixed(2)}</td>
                </tr>
              </table>
              <p style="margin: 2px 0; font-size: 13px; color: #6b7280;">Qty: ${item.quantity}</p>
              ${item.options ? `<p style="margin: 4px 0 0; font-size: 13px; color: #6b7280;">${item.options}</p>` : ''}
              ${item.design_service_enabled ? `
                <span style="display: inline-block; background-color: #faf5ff; color: #7c3aed; font-size: 11px; font-weight: 600; padding: 4px 8px; border-radius: 4px; margin-top: 8px;">✨ Design Service</span>
              ` : ''}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `).join('');

  // Generate design service section HTML
  let designServiceHtml = '';
  if (hasDesignService) {
    const designItems = order.items.filter(item => item.design_service_enabled);
    designServiceHtml = `
      <!-- Design Service Section -->
      <tr>
        <td style="padding: 0 24px 24px;">
          <h3 style="color: #7c3aed; font-size: 18px; font-weight: 700; margin: 0 0 12px;">⚡ Action Required: Design Service Order</h3>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #faf5ff; border: 2px solid #c4b5fd; border-radius: 8px; margin-bottom: 16px;">
            <tr>
              <td style="padding: 16px; color: #6b21a8; font-size: 14px; line-height: 1.5; text-align: center;">
                This customer has requested our design team to create their banner. Please review the details below and begin working on their design.
              </td>
            </tr>
          </table>
          ${designItems.map(item => `
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #ffffff; border: 1px solid #e9d5ff; border-radius: 8px; margin-bottom: 12px;">
              <tr>
                <td style="padding: 16px;">
                  <p style="color: #7c3aed; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 6px;">How to Send Drafts</p>
                  <p style="color: #1f2937; font-size: 14px; font-weight: 500; margin: 0 0 16px;">${item.design_draft_preference === 'email' ? '📧 Email' : '📱 Text Message'}: ${item.design_draft_contact || 'Not provided'}</p>

                  ${item.design_request_text ? `
                    <p style="color: #7c3aed; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 6px;">Customer's Design Description</p>
                    <div style="background-color: #faf5ff; border: 1px solid #e9d5ff; border-radius: 6px; padding: 12px; margin-bottom: 16px;">
                      <p style="color: #374151; font-size: 14px; line-height: 1.5; margin: 0; white-space: pre-wrap;">${item.design_request_text}</p>
                    </div>
                  ` : ''}

                  ${item.design_uploaded_assets && item.design_uploaded_assets.length > 0 ? `
                    <p style="color: #7c3aed; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 6px;">Customer's Uploaded Files (${item.design_uploaded_assets.length})</p>
                    <div style="background-color: #faf5ff; border-radius: 6px; padding: 8px;">
                      ${item.design_uploaded_assets.map(asset => `
                        <p style="margin: 4px 0;"><a href="${asset.url}" style="color: #7c3aed; font-size: 13px; text-decoration: none; font-weight: 500;">📎 ${asset.name}</a></p>
                      `).join('')}
                    </div>
                  ` : ''}
                </td>
              </tr>
            </table>
          `).join('')}
        </td>
      </tr>
    `;
  }

  // Generate shipping address HTML
  let shippingHtml = '';
  if (order.shipping_name || order.shipping_street) {
    shippingHtml = `
      <!-- Shipping Address -->
      <tr>
        <td style="padding: 0 24px 24px;">
          <h3 style="color: #1f2937; font-size: 16px; font-weight: 700; margin: 0 0 16px;">📦 Shipping Address</h3>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px;">
            <tr>
              <td style="padding: 16px;">
                ${order.shipping_name ? `<p style="color: #1f2937; font-size: 15px; font-weight: 600; margin: 0 0 4px;">${order.shipping_name}</p>` : ''}
                ${order.shipping_street ? `<p style="color: #4b5563; font-size: 14px; line-height: 1.6; margin: 0;">${order.shipping_street}</p>` : ''}
                ${(order.shipping_city || order.shipping_state || order.shipping_zip) ? `<p style="color: #4b5563; font-size: 14px; line-height: 1.6; margin: 0;">${order.shipping_city || ''}${order.shipping_city && order.shipping_state ? ', ' : ''}${order.shipping_state || ''} ${order.shipping_zip || ''}</p>` : ''}
                ${order.shipping_country && order.shipping_country !== 'US' ? `<p style="color: #4b5563; font-size: 14px; line-height: 1.6; margin: 0;">${order.shipping_country}</p>` : ''}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    `;
  }

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
      <title>New Order - Banners on the Fly</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Ubuntu, sans-serif; line-height: 1.6; color: #333333; background-color: #f6f9fc;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 0; padding: 20px 0; background-color: #f6f9fc;">
        <tr>
          <td align="center">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15); overflow: hidden;">

              <!-- Logo Section -->
              <tr>
                <td style="text-align: center; padding: 24px 30px 16px; background-color: #ffffff;">
                  <img src="${logoUrl}" alt="Banners On The Fly" width="180" style="display: block; margin: 0 auto; max-width: 180px; height: auto;" />
                </td>
              </tr>

              <!-- Header with Gradient -->
              <tr>
                <td style="background: linear-gradient(135deg, #059669 0%, #10b981 100%); padding: 32px 24px; text-align: center;">
                  <h1 style="color: #ffffff; font-size: 26px; font-weight: 700; margin: 0 0 8px;">🎉 New Order Received!</h1>
                  <p style="color: rgba(255, 255, 255, 0.9); font-size: 15px; margin: 0;">A customer has placed a new order on Banners On The Fly</p>
                </td>
              </tr>

              <!-- Quick Summary Card -->
              <tr>
                <td style="background-color: #f0fdf4; padding: 20px 24px; border-bottom: 1px solid #d1fae5;">
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                    <tr>
                      <td width="50%" style="text-align: center;">
                        <p style="color: #6b7280; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 4px;">Order #</p>
                        <p style="color: #1f2937; font-size: 20px; font-weight: 700; margin: 0; font-family: monospace;">${order.number}</p>
                      </td>
                      <td width="50%" style="text-align: center;">
                        <p style="color: #6b7280; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 4px;">Total</p>
                        <p style="color: #059669; font-size: 24px; font-weight: 700; margin: 0;">$${total.toFixed(2)}</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Order Details -->
              <tr>
                <td style="padding: 24px;">
                  <h3 style="color: #1f2937; font-size: 16px; font-weight: 700; margin: 0 0 16px;">📋 Order Details</h3>
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px;">
                    <tr>
                      <td style="padding: 10px 16px; border-bottom: 1px solid #e5e7eb;">
                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                          <tr>
                            <td style="color: #6b7280; font-size: 13px; font-weight: 600;">Customer Name</td>
                            <td style="color: #1f2937; font-size: 14px; font-weight: 500; text-align: right;">${order.customerName || 'Valued Customer'}</td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 10px 16px; border-bottom: 1px solid #e5e7eb;">
                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                          <tr>
                            <td style="color: #6b7280; font-size: 13px; font-weight: 600;">Email Address</td>
                            <td style="color: #1f2937; font-size: 14px; font-weight: 500; text-align: right;"><a href="mailto:${order.email}" style="color: #2563eb; text-decoration: none;">${order.email}</a></td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 10px 16px; border-bottom: 1px solid #e5e7eb;">
                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                          <tr>
                            <td style="color: #6b7280; font-size: 13px; font-weight: 600;">Order Date</td>
                            <td style="color: #1f2937; font-size: 14px; font-weight: 500; text-align: right;">${formattedDate}</td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 10px 16px;">
                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                          <tr>
                            <td style="color: #6b7280; font-size: 13px; font-weight: 600;">Order ID</td>
                            <td style="color: #1f2937; font-size: 12px; font-weight: 500; text-align: right; font-family: monospace;">${order.id}</td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Order Items -->
              <tr>
                <td style="padding: 0 24px 24px;">
                  <h3 style="color: #1f2937; font-size: 16px; font-weight: 700; margin: 0 0 16px;">🛒 Order Items</h3>
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
                    ${itemsHtml}
                    <!-- Totals -->
                    <tr>
                      <td style="background-color: #f9fafb; padding: 16px;">
                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                          <tr>
                            <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
                              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                <tr>
                                  <td style="color: #6b7280; font-size: 14px;">Subtotal</td>
                                  <td style="color: #1f2937; font-size: 14px; text-align: right;">$${subtotal.toFixed(2)}</td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                          ${discountCents > 0 ? `
                          <tr>
                            <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
                              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                <tr>
                                  <td style="color: #059669; font-size: 14px;">${discountLabel || 'Discount'}</td>
                                  <td style="color: #059669; font-size: 14px; text-align: right;">-$${discountDollars.toFixed(2)}</td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                          ` : ''}
                          ${tax > 0 ? `
                          <tr>
                            <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
                              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                <tr>
                                  <td style="color: #6b7280; font-size: 14px;">Tax</td>
                                  <td style="color: #1f2937; font-size: 14px; text-align: right;">$${tax.toFixed(2)}</td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                          ` : ''}
                          <tr>
                            <td style="padding: 16px 0 0;">
                              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                <tr>
                                  <td style="color: #1f2937; font-size: 16px; font-weight: 700;">Total Paid</td>
                                  <td style="color: #059669; font-size: 20px; font-weight: 700; text-align: right;">$${total.toFixed(2)}</td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              ${shippingHtml}

              ${designServiceHtml}

              <!-- Action Button -->
              <tr>
                <td style="padding: 8px 24px 32px; text-align: center;">
                  <a href="${invoiceUrl}" style="background-color: #059669; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 600; font-size: 15px;">View Full Order in Admin Panel</a>
                </td>
              </tr>

              <!-- Divider -->
              <tr>
                <td>
                  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 0;" />
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="padding: 24px; background-color: #f9fafb; text-align: center;">
                  <p style="color: #6b7280; font-size: 13px; margin: 0 0 8px;">This is an automated notification from Banners On The Fly.</p>
                  <p style="color: #6b7280; font-size: 13px; margin: 0 0 12px;">
                    <a href="https://bannersonthefly.com" style="color: #2563eb; text-decoration: none;">Website</a>
                    &nbsp;•&nbsp;
                    <a href="mailto:${order.email}" style="color: #2563eb; text-decoration: none;">Email Customer</a>
                  </p>
                  <p style="color: #9ca3af; font-size: 11px; margin: 0;">© ${new Date().getFullYear()} Banners On The Fly. All rights reserved.</p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

// Send email with retry logic for rate limiting
async function sendEmailWithRetry(resendClient, emailData, maxAttempts = 3) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await resendClient.emails.send(emailData);
      if (result.error) {
        throw new Error(result.error);
      }
      return result;
    } catch (error) {
      lastError = error;

      // Check if error is retryable (429 rate limit or 5xx server errors)
      const isRetryable = error?.status === 429 || (error?.status >= 500 && error?.status < 600) ||
                         error?.message?.includes('Too many requests');

      if (!isRetryable || attempt === maxAttempts) {
        throw error;
      }

      // Exponential backoff: 1s, 3s for rate limiting
      const delay = attempt === 1 ? 1000 : 3000;
      await new Promise(resolve => setTimeout(resolve, delay));

      console.log(`Email send attempt ${attempt} failed (rate limited), retrying in ${delay}ms:`, error?.message);
    }
  }

  throw lastError;
}

// Send email using existing email system
async function sendEmail(type, payload) {
  try {
    const { Resend } = require('resend');

    if (!process.env.RESEND_API_KEY) {
      return { ok: false, error: 'RESEND_API_KEY not configured' };
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    
    const emailFrom = process.env.EMAIL_FROM || 'orders@bannersonthefly.com';
    const emailReplyTo = process.env.EMAIL_REPLY_TO || 'support@bannersonthefly.com';

    let subject, html;
    
    if (type === 'order.confirmation') {
      subject = `Order Confirmation #${payload.order.number} - Banners On The Fly`;
      html = createEmailContainer(`
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 0; padding: 20px;">
          <tr>
            <td>
              <h2 style="color: #2563eb; margin: 0 0 20px 0; font-size: 28px; text-align: center;">Order Confirmation</h2>
          <p>Hello ${(payload.order.customerName || 'Valued Customer')},</p>
          <p>Thank you for your order! We've received your custom banner order and will begin processing it shortly.</p>
          
          <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #374151;">Order Details</h3>
            <p><strong>Order Number:</strong> #${payload.order.number}</p>
            <p><strong>Order ID:</strong> ${payload.order.id}</p>
            
            <h4 style="color: #374151;">Items:</h4>
            ${payload.order.items.map(item => `
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-bottom: 1px solid #e5e7eb; margin-bottom: 10px;">
                <tr>
                  ${item.thumbnailUrl ? `
                  <td style="width: 130px; padding: 10px 15px 10px 0; vertical-align: top;">
                    <img src="${item.thumbnailUrl}" 
                         alt="Banner Preview" 
                         width="120" 
                         style="border-radius: 6px; border: 1px solid #e5e7eb; display: block; max-width: 120px;" />
                  </td>
                  ` : ''}
                  <td style="padding: 10px 0; vertical-align: top;">
                    <p style="margin: 5px 0;"><strong>${item.name}</strong></p>
                    <p style="margin: 5px 0; color: #6b7280;">Quantity: ${item.quantity}</p>
                    <p style="margin: 5px 0; color: #6b7280;">${item.options}</p>
                    <p style="margin: 5px 0;"><strong>$${(item.price || 0).toFixed(2)}</strong></p>
                  </td>
                </tr>
              </table>
            `).join('')}
            
            <div style="margin-top: 20px; padding-top: 20px; border-top: 2px solid #e5e7eb;">
              <p style="margin: 5px 0;">Subtotal: ${payload.order.subtotal ? '$' + payload.order.subtotal.toFixed(2) : '$' + ((payload.order.subtotalCents || 0) / 100).toFixed(2)}</p>
              ${payload.order.discountCents > 0 ? `<p style="margin: 5px 0; color: #059669;">${payload.order.discountLabel || 'Discount'}: -$${(payload.order.discountCents / 100).toFixed(2)}</p>` : ''}
              ${(payload.order.tax || payload.order.taxCents) > 0 ? `<p style="margin: 5px 0;">Tax: ${payload.order.tax ? '$' + payload.order.tax.toFixed(2) : '$' + ((payload.order.taxCents || 0) / 100).toFixed(2)}</p>` : ''}
              <p style="margin: 5px 0; font-size: 18px;"><strong>Total: ${payload.order.total ? '$' + payload.order.total.toFixed(2) : '$' + ((payload.order.totalCents || 0) / 100).toFixed(2)}</strong></p>
            </div>
          </div>
          
          ${payload.order.shipping_name ? `
            <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #374151;">Shipping Address</h3>
              <p style="margin: 5px 0; font-weight: 600;">${payload.order.shipping_name}</p>
              ${payload.order.shipping_street ? `<p style="margin: 5px 0;">${payload.order.shipping_street}</p>` : ''}
              ${(payload.order.shipping_city || payload.order.shipping_state || payload.order.shipping_zip) ? `<p style="margin: 5px 0;">${payload.order.shipping_city || ''}${payload.order.shipping_city && payload.order.shipping_state ? ', ' : ''}${payload.order.shipping_state || ''} ${payload.order.shipping_zip || ''}</p>` : ''}
              ${payload.order.shipping_country && payload.order.shipping_country !== 'US' ? `<p style="margin: 5px 0;">${payload.order.shipping_country}</p>` : ''}
            </div>
          ` : ''}
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${payload.invoiceUrl}" 
               style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              View Order Details
            </a>
          </div>
          
          <p style="color: #6b7280;">
            We'll send you another email with tracking information once your order ships.
          </p>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
          <p style="color: #6b7280; font-size: 12px;">
            Banners On The Fly<br>
            Custom Banner Printing Services<br>
            Questions? Reply to this email or contact support.
          </p>
            </td>
          </tr>
        </table>
      `);
    } else if (type === 'order.admin_notification') {
      // Use improved admin email template matching AdminOrderNotification.tsx
      subject = `🎉 New Order #${payload.order.number} - ${payload.order.total ? '$' + payload.order.total.toFixed(2) : '$' + ((payload.order.totalCents || 0) / 100).toFixed(2)}`;
      html = createAdminOrderEmailHtml(payload);
    } else {
      return { ok: false, error: `Unknown email type: ${type}` };
    }

    const emailData = {
      from: emailFrom,
      to: payload.to,
      replyTo: emailReplyTo,
      subject,
      html
    };

    const result = await sendEmailWithRetry(resend, emailData);

    return { ok: true, id: result.data?.id };
  } catch (error) {
    console.error('Email send error:', error);
    return { 
      ok: false, 
      error: error.message || 'Email send failed',
      details: error
    };
  }
}

// Log email attempt to database
async function logEmailAttempt(attempt) {
  try {
    const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    if (!dbUrl) return;

    const db = neon(dbUrl);
    await db`
      INSERT INTO email_events (type, to_email, provider_msg_id, status, error_message, order_id, created_at)
      VALUES (
        ${attempt.type}, 
        ${attempt.to}, 
        ${attempt.providerMsgId || null}, 
        ${attempt.status}, 
        ${attempt.errorMessage || null}, 
        ${attempt.orderId || null}, 
        NOW()
      )
    `;
  } catch (error) {
    console.error('Failed to log email attempt:', error);
  }
}

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ ok: false, error: 'Method not allowed' })
    };
  }

  try {
    const { orderId } = JSON.parse(event.body || '{}');
    
    if (!orderId || typeof orderId !== 'string') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: 'Order ID is required' })
      };
    }

    const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    if (!dbUrl) {
      console.error('Database URL not configured');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ ok: false, error: 'Database not configured' })
      };
    }

    const db = neon(dbUrl);
    
    // Load order by ID
    const orderRows = await db`
      SELECT * FROM orders WHERE id = ${orderId}
    `;
    
    if (orderRows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ ok: false, error: 'Order not found' })
      };
    }

    const order = orderRows[0];

    // Idempotency Check: If already sent, return success without sending
    if (order.confirmation_email_status === 'sent' || order.confirmation_emailed_at) {
      console.log(`Order ${orderId} confirmation email already sent, returning idempotent response`);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true, idempotent: true })
      };
    }
    
    // Load order items
    const itemRows = await db`
      SELECT * FROM order_items WHERE order_id = ${orderId}
    `;

    // Build origin URL for order details link
    const origin = event.headers['x-forwarded-host']
      ? `https://${event.headers['x-forwarded-host']}`
      : process.env.PUBLIC_SITE_URL || 'https://www.bannersonthefly.com';

    const invoiceUrl = `${origin}/orders/${orderId}`;

    // Convert database order to email format
    // Use customer_name first, then shipping_name as fallback (shipping_name often has the actual name)
    const customerName = order.customer_name || order.shipping_name || 'Valued Customer';

    const emailPayload = {
      to: order.email,
      order: {
        id: order.id,
        number: order.id ? order.id.slice(-8).toUpperCase() : 'UNKNOWN',
        customerName: customerName,
        items: itemRows.map((item) => {
          // Calculate cost breakdown
          const ropeCost = (item.rope_feet || 0) * 2 * item.quantity * 100; // in cents
          // Calculate pole pocket cost using correct logic from cart store
          const polePocketCost = (() => {
            if (!item.pole_pockets || item.pole_pockets === 'none') return 0;
            
            const setupFee = 15.00;
            const pricePerLinearFoot = 2.00;
            
            let linearFeet = 0;
            switch (item.pole_pockets) {
              case 'top':
              case 'bottom':
                linearFeet = item.width_in / 12;
                break;
              case 'left':
              case 'right':
                linearFeet = item.height_in / 12;
                break;
              case 'top-bottom':
                linearFeet = (item.width_in / 12) * 2;
                break;
              default:
                linearFeet = 0;
            }
            
            return Math.round((setupFee + (linearFeet * pricePerLinearFoot * item.quantity)) * 100);
          })();
          const baseCost = item.line_total_cents - ropeCost - polePocketCost;
          const unitPrice = baseCost / item.quantity;
          
          return {
          name: `Custom Banner ${item.width_in}"×${item.height_in}"`,
          quantity: item.quantity,
          price: item.line_total_cents / 100,
          options: [
            `Material: ${item.material}`,
            item.grommets && item.grommets !== 'none' ? `Grommets: ${item.grommets}` : null,
            item.rope_feet && item.rope_feet > 0 ? `Rope: ${item.rope_feet.toFixed(1)} ft` : null,
            (item.pole_pocket_position && item.pole_pocket_position !== 'none')
              ? `Pole Pockets: ${item.pole_pocket_position}${item.pole_pocket_size ? ` (${item.pole_pocket_size} inch)` : ''}`
              : (item.pole_pockets && item.pole_pockets !== 'none' && item.pole_pockets !== false && item.pole_pockets !== 'false')
                ? 'Pole Pockets: Yes'
                : null,
            item.file_key ? `File: ${item.file_key}` : null,
            item.design_service_enabled ? '⚡ Design Service Order' : null
          ].filter(Boolean).join(' • '),
          // Cost breakdown data
          material: item.material,
          unitPriceCents: Math.round(unitPrice),
          ropeFeet: item.rope_feet || 0,
          ropeCostCents: Math.round(ropeCost),
          polePocketCostCents: Math.round(polePocketCost),
          polePocketPosition: item.pole_pocket_position || item.pole_pockets,
          polePocketSize: item.pole_pocket_size,
          baseCostCents: Math.round(baseCost),
          thumbnailUrl: getThumbnailUrl(item, 300),
          // Design Service fields
          design_service_enabled: item.design_service_enabled || false,
          design_request_text: item.design_request_text || null,
          design_draft_preference: item.design_draft_preference || null,
          design_draft_contact: item.design_draft_contact || null,
          design_uploaded_assets: item.design_uploaded_assets || []
          };
        }),
        // FIX: Calculate correct subtotal, tax, and total from line_total_cents
        // Database values may be incorrect, so recalculate from item totals
        get subtotal() {
          const calculatedSubtotal = itemRows.reduce((sum, item) => sum + item.line_total_cents, 0);
          return calculatedSubtotal / 100;
        },
        get tax() {
          const calculatedSubtotal = itemRows.reduce((sum, item) => sum + item.line_total_cents, 0);
          const discount = order.applied_discount_cents || 0;
          const calculatedTax = Math.round((calculatedSubtotal - discount) * 0.06);
          return calculatedTax / 100;
        },
        get total() {
          const calculatedSubtotal = itemRows.reduce((sum, item) => sum + item.line_total_cents, 0);
          const discount = order.applied_discount_cents || 0;
          const afterDiscount = calculatedSubtotal - discount;
          const calculatedTax = Math.round(afterDiscount * 0.06);
          const calculatedTotal = afterDiscount + calculatedTax;
          return calculatedTotal / 100;
        },
        get subtotalCents() {
          return itemRows.reduce((sum, item) => sum + item.line_total_cents, 0);
        },
        discountCents: order.applied_discount_cents || 0,
        discountLabel: order.applied_discount_label || "",
        discountType: order.applied_discount_type || "none",
        get taxCents() {
          const calculatedSubtotal = itemRows.reduce((sum, item) => sum + item.line_total_cents, 0);
          const discount = order.applied_discount_cents || 0;
          return Math.round((calculatedSubtotal - discount) * 0.06);
        },
        get totalCents() {
          const calculatedSubtotal = itemRows.reduce((sum, item) => sum + item.line_total_cents, 0);
          const discount = order.applied_discount_cents || 0;
          const afterDiscount = calculatedSubtotal - discount;
          const calculatedTax = Math.round(afterDiscount * 0.06);
          return afterDiscount + calculatedTax;
        },
        shipping_name: order.shipping_name,
        shipping_street: order.shipping_street,
        shipping_city: order.shipping_city,
        shipping_state: order.shipping_state,
        shipping_zip: order.shipping_zip,
        shipping_country: order.shipping_country
      },
      invoiceUrl
    };

    // Send confirmation email
    const emailResult = await sendEmail('order.confirmation', emailPayload);
    
    // Log email attempt
    await logEmailAttempt({
      type: 'order.confirmation',
      to: order.email,
      orderId: order.id,
      status: emailResult.ok ? 'sent' : 'error',
      providerMsgId: emailResult.ok ? emailResult.id : undefined,
      errorMessage: emailResult.ok ? undefined : `${emailResult.error} ${emailResult.details ? JSON.stringify(emailResult.details) : ''}`.trim()
    });

    if (emailResult.ok) {
      // Update order with confirmation email status
      await db`
        UPDATE orders
        SET confirmation_email_status = 'sent',
            confirmation_emailed_at = NOW()
        WHERE id = ${orderId}
      `;

      console.log(`Order confirmation email sent successfully for order ${orderId}, email ID: ${emailResult.id}`);

      // Send admin notification email to info@bannersonthefly.com
      const adminEmail = process.env.ADMIN_EMAIL || 'info@bannersonthefly.com';

      try {
        // Add delay to prevent rate limiting (Resend allows 2 requests per second)
        await new Promise(resolve => setTimeout(resolve, 1000));

        const adminEmailPayload = {
          to: adminEmail,
          order: {
            ...emailPayload.order,
            email: order.email, // Add customer email to admin notification
            created_at: order.created_at
          },
          invoiceUrl: emailPayload.invoiceUrl
        };

        const adminEmailResult = await sendEmail('order.admin_notification', adminEmailPayload);

        // Log admin email attempt
        await logEmailAttempt({
          type: 'order.admin_notification',
          to: adminEmail,
          orderId: order.id,
          status: adminEmailResult.ok ? 'sent' : 'error',
          providerMsgId: adminEmailResult.ok ? adminEmailResult.id : undefined,
          errorMessage: adminEmailResult.ok ? undefined : `${adminEmailResult.error} ${adminEmailResult.details ? JSON.stringify(adminEmailResult.details) : ''}`.trim()
        });

        if (adminEmailResult.ok) {
          // Update order with admin notification status
          await db`
            UPDATE orders
            SET admin_notification_status = 'sent',
                admin_notification_sent_at = NOW()
            WHERE id = ${orderId}
          `;
          console.log(`Admin notification email sent successfully for order ${orderId}, email ID: ${adminEmailResult.id}`);
        } else {
          console.error(`Admin notification email failed for order ${orderId}:`, adminEmailResult);
          // Don't fail the main request if admin email fails
        }
      } catch (adminEmailError) {
        console.error(`Admin notification email error for order ${orderId}:`, adminEmailError);
        // Log the failed attempt
        await logEmailAttempt({
          type: 'order.admin_notification',
          to: adminEmail,
          orderId: order.id,
          status: 'error',
          errorMessage: adminEmailError.message || 'Unknown error'
        });
        // Don't fail the main request if admin email fails
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true, id: emailResult.id })
      };
    } else {
      console.error(`Order confirmation email failed for order ${orderId}:`, emailResult);
      
      // Don't update order status on failure, allowing for retry
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          ok: false, 
          error: emailResult.error || 'Failed to send email',
          details: emailResult.details
        })
      };
    }

  } catch (error) {
    console.error('Order notification failed:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        ok: false, 
        error: 'Internal server error',
        details: error.message
      })
    };
  }
};
