import { neon } from '@neondatabase/serverless';

const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
const db = neon(dbUrl);

const email = 'b.schaefermarketer@outlook.com';

console.log('🔍 Checking for user:', email);

const users = await db`
  SELECT id, email, email_verified, created_at 
  FROM profiles 
  WHERE email = ${email.toLowerCase().trim()}
`;

console.log('Found users:', users);

if (users.length > 0) {
  console.log('\n❌ USER EXISTS - Deleting now...\n');
  
  const userId = users[0].id;
  
  // Delete verification tokens
  await db`DELETE FROM email_verifications WHERE user_id = ${userId}`;
  console.log('✅ Deleted email verifications');
  
  // Delete user carts
  await db`DELETE FROM user_carts WHERE user_id = ${userId}`;
  console.log('✅ Deleted user carts');
  
  // Delete profile
  await db`DELETE FROM profiles WHERE id = ${userId}`;
  console.log('✅ Deleted profile');
  
  console.log('\n✅ USER COMPLETELY DELETED\n');
} else {
  console.log('\n✅ NO USER FOUND - Ready to sign up\n');
}
