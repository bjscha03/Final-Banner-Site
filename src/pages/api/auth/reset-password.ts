import type { APIRoute } from 'astro';
import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';

export const POST: APIRoute = async ({ request }) => {
  try {
    const { token, newPassword } = await request.json();
    
    if (!token || typeof token !== 'string') {
      return new Response(JSON.stringify({ 
        ok: false, 
        error: 'Reset token is required' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
      return new Response(JSON.stringify({ 
        ok: false, 
        error: 'Password must be at least 8 characters long' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const db = neon(import.meta.env.NETLIFY_DATABASE_URL || import.meta.env.DATABASE_URL);
    
    // Find valid reset token
    const resetTokens = await db`
      SELECT id, email, expires_at, used_at 
      FROM password_resets 
      WHERE token = ${token}
    `;
    
    if (resetTokens.length === 0) {
      return new Response(JSON.stringify({ 
        ok: false, 
        error: 'Invalid or expired reset token' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const resetToken = resetTokens[0];
    
    // Check if token is expired
    if (new Date() > new Date(resetToken.expires_at)) {
      return new Response(JSON.stringify({ 
        ok: false, 
        error: 'Reset token has expired' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if token was already used
    if (resetToken.used_at) {
      return new Response(JSON.stringify({ 
        ok: false, 
        error: 'Reset token has already been used' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update user password (assuming you have a password field in profiles or separate auth table)
    // Note: This assumes you have a password field. Adjust based on your auth system.
    await db`
      UPDATE profiles 
      SET password_hash = ${hashedPassword}, updated_at = NOW()
      WHERE email = ${resetToken.email}
    `;

    // Mark token as used
    await db`
      UPDATE password_resets 
      SET used_at = NOW()
      WHERE id = ${resetToken.id}
    `;

    console.log(`Password reset completed for email: ${resetToken.email}`);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Password reset failed:', error);
    
    return new Response(JSON.stringify({ 
      ok: false, 
      error: 'Internal server error' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
