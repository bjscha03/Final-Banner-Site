const { neon } = require('@neondatabase/serverless');
const { sendEmail } = require('../../src/lib/email');

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

    // Send notification email to support team
    const supportEmail = process.env.SUPPORT_EMAIL || 'support@bannersonthefly.com';
    
    try {
      await sendEmail('contact.received', {
        to: supportEmail,
        contact: {
          id: contactId,
          name,
          email,
          subject,
          message,
          created_at: createdAt
        }
      });
    } catch (emailError) {
      console.error('Failed to send support notification email:', emailError);
      // Don't fail the request if email fails
    }

    // Send acknowledgment email to user
    try {
      await sendEmail('contact.acknowledgment', {
        to: email,
        contact: {
          name,
          subject
        }
      });
    } catch (emailError) {
      console.error('Failed to send user acknowledgment email:', emailError);
      // Don't fail the request if email fails
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
