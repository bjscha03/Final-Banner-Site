import type { APIRoute } from 'astro';
import { neon } from '@neondatabase/serverless';
import { sendEmail, logEmailAttempt } from '../../../lib/email';

export const POST: APIRoute = async ({ request }) => {
  try {
    const { email } = await request.json();
    
    if (!email || typeof email !== 'string') {
      return new Response(JSON.stringify({ 
        ok: false, 
        error: 'Email is required' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const db = neon(import.meta.env.NETLIFY_DATABASE_URL || import.meta.env.DATABASE_URL);
    
    // Check if user exists (but don't leak this information in response)
    const users = await db`
      SELECT id, email FROM profiles WHERE email = ${email.toLowerCase().trim()}
    `;
    
    if (users.length === 0) {
      // Always return success to prevent email enumeration
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Generate secure token
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    // Store reset token
    await db`
      INSERT INTO password_resets (email, token, expires_at)
      VALUES (${email.toLowerCase().trim()}, ${token}, ${expiresAt})
    `;

    // Send reset email
    const resetUrl = `${import.meta.env.SITE_URL || 'https://www.bannersonthefly.com'}/reset-password?token=${token}`;
    const result = await sendEmail('user.reset', {
      to: email,
      resetUrl,
      userName: users[0].email.split('@')[0] // Use email prefix as fallback name
    });

    // Log email attempt
    await logEmailAttempt({
      type: 'user.reset',
      to: email,
      status: result.ok ? 'sent' : 'error',
      providerMsgId: result.ok ? result.id : undefined,
      errorMessage: result.ok ? undefined : `${result.error} ${result.details ? JSON.stringify(result.details) : ''}`.trim()
    });

    if (!result.ok) {
      console.error('Password reset email failed:', result);
    }

    // Always return success (don't leak email send failures)
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Password reset request failed:', error);
    
    return new Response(JSON.stringify({ 
      ok: false, 
      error: 'Internal server error' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
