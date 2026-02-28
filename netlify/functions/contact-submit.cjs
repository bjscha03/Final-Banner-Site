const { neon } = require('@neondatabase/serverless');

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

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
    const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.VITE_DATABASE_URL || process.env.DATABASE_URL;
    if (!dbUrl) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ ok: false, error: 'Database not configured' })
      };
    }

    const sql = neon(dbUrl);
    const contactData = JSON.parse(event.body);

    // Validate required fields
    const { name, email, subject, message } = contactData;
    
    if (!name || !email || !subject || !message) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          ok: false, 
          error: 'All fields are required: name, email, subject, message' 
        })
      };
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          ok: false, 
          error: 'Please provide a valid email address' 
        })
      };
    }

    // Validate field lengths
    if (name.length > 120) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          ok: false, 
          error: 'Name must be 120 characters or less' 
        })
      };
    }

    if (email.length > 255) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          ok: false, 
          error: 'Email must be 255 characters or less' 
        })
      };
    }

    if (subject.length > 200) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          ok: false, 
          error: 'Subject must be 200 characters or less' 
        })
      };
    }

    if (message.length > 5000) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          ok: false, 
          error: 'Message must be 5000 characters or less' 
        })
      };
    }

    // Insert contact message into database
    const contactResult = await sql`
      INSERT INTO contact_messages (name, email, subject, message)
      VALUES (${name}, ${email}, ${subject}, ${message})
      RETURNING id, created_at
    `;

    const contactId = contactResult[0].id;
    const createdAt = contactResult[0].created_at;

    console.log('Contact form submitted:', { contactId, name, email, subject });

    // Send emails via Resend (non-blocking - don't fail the request if email fails)
    try {
      const { Resend } = require('resend');
      const apiKey = process.env.RESEND_API_KEY;
      if (apiKey) {
        const resend = new Resend(apiKey);
        const emailFrom = process.env.EMAIL_FROM || 'info@bannersonthefly.com';
        const emailReplyTo = process.env.EMAIL_REPLY_TO || 'support@bannersonthefly.com';
        const adminEmail = process.env.ADMIN_EMAIL || 'info@bannersonthefly.com';
        const logoUrl = 'https://res.cloudinary.com/dtrxl120u/image/fetch/f_auto,q_auto,w_300/https://bannersonthefly.com/cld-assets/images/logo-compact.svg';
        const formattedDate = new Date(createdAt).toLocaleString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' });
        const safeMessage = message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        // 1) Admin notification email
        const adminHtml = '<!DOCTYPE html><html><head><meta charset="utf-8"></head>'
          + '<body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#f4f4f4;">'
          + '<div style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,0.1);">'
          + '<div style="text-align:center;padding:20px;"><img src="' + logoUrl + '" alt="Banners On The Fly" style="height:50px;"></div>'
          + '<div style="background:#dc2626;color:#fff;padding:24px;text-align:center;"><h1 style="margin:0;font-size:22px;">New Contact Form Submission</h1><p style="margin:8px 0 0;color:#fecaca;">A customer has sent a message</p></div>'
          + '<div style="padding:24px;"><h3 style="color:#1f2937;margin:0 0 16px;">Contact Details</h3>'
          + '<p style="margin:6px 0;"><strong>Name:</strong> ' + name + '</p>'
          + '<p style="margin:6px 0;"><strong>Email:</strong> <a href="mailto:' + email + '" style="color:#dc2626;">' + email + '</a></p>'
          + '<p style="margin:6px 0;"><strong>Subject:</strong> ' + subject + '</p>'
          + '<p style="margin:6px 0;"><strong>Submitted:</strong> ' + formattedDate + '</p>'
          + '<p style="margin:6px 0;"><strong>Contact ID:</strong> ' + contactId + '</p>'
          + '<h3 style="color:#1f2937;margin:20px 0 12px;">Message</h3>'
          + '<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:16px;"><p style="margin:0;white-space:pre-wrap;">' + safeMessage + '</p></div>'
          + '</div></div></body></html>';

        const adminResult = await resend.emails.send({
          from: 'Banners On The Fly <' + emailFrom + '>',
          to: adminEmail,
          subject: 'New Contact Form: ' + subject,
          html: adminHtml,
          reply_to: email,
          tags: [{ name: 'source', value: 'contact_form' }]
        });
        console.log('Admin contact email sent:', adminResult.data?.id || adminResult);

        // 2) Customer acknowledgment email
        const ackHtml = '<!DOCTYPE html><html><head><meta charset="utf-8"></head>'
          + '<body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#f4f4f4;">'
          + '<div style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,0.1);">'
          + '<div style="text-align:center;padding:20px;"><img src="' + logoUrl + '" alt="Banners On The Fly" style="height:50px;"></div>'
          + '<div style="background:#2563eb;color:#fff;padding:24px;text-align:center;"><h1 style="margin:0;font-size:22px;">Message Received!</h1><p style="margin:8px 0 0;color:#bfdbfe;">Thank you for contacting Banners On The Fly</p></div>'
          + '<div style="padding:24px;">'
          + '<p style="font-weight:600;">Hi ' + name + ',</p>'
          + '<p>Thank you for reaching out! We have received your message about \"<strong>' + subject + '</strong>\" and our support team will review it shortly.</p>'
          + '<p>We typically respond to all inquiries within 24 hours during business days. If your message is urgent, you can reach us at:</p>'
          + '<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:16px;margin:16px 0;"><p style="margin:4px 0;">Email: <a href="mailto:support@bannersonthefly.com" style="color:#2563eb;">support@bannersonthefly.com</a></p></div>'
          + '<p>In the meantime, feel free to browse our website to learn more about our custom banner printing services.</p>'
          + '<div style="text-align:center;margin:24px 0;"><a href="https://bannersonthefly.com" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">Visit Our Website</a></div>'
          + '</div></div></body></html>';

        const ackResult = await resend.emails.send({
          from: 'Banners On The Fly <' + emailFrom + '>',
          to: email,
          subject: 'Thank you for contacting Banners On The Fly',
          html: ackHtml,
          reply_to: emailReplyTo,
          tags: [{ name: 'source', value: 'contact_ack' }]
        });
        console.log('Customer acknowledgment email sent:', ackResult.data?.id || ackResult);

        // Log email events to database
        try {
          await sql`INSERT INTO email_events (type, to_email, status, provider_msg_id, created_at) VALUES ('contact.received', ${adminEmail}, 'sent', ${adminResult.data?.id || null}, NOW())`;
          await sql`INSERT INTO email_events (type, to_email, status, provider_msg_id, created_at) VALUES ('contact.acknowledgment', ${email}, 'sent', ${ackResult.data?.id || null}, NOW())`;
        } catch (logErr) {
          console.warn('Failed to log email events:', logErr.message);
        }
      } else {
        console.warn('RESEND_API_KEY not configured, skipping contact emails');
      }
    } catch (emailError) {
      console.error('Failed to send contact emails:', emailError);
      // Don't fail the request - the contact was saved to DB successfully
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        message: 'Contact form submitted successfully',
        contactId: contactId
      })
    };

  } catch (error) {
    console.error('Error processing contact form:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        ok: false,
        error: 'Failed to submit contact form',
        details: error.message
      })
    };
  }
};
