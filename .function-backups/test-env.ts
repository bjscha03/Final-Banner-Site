import { Handler } from '@netlify/functions';

export const handler: Handler = async () => {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      DATABASE_URL: process.env.DATABASE_URL ? 'SET ✅' : 'NOT SET ❌',
      NETLIFY_DATABASE_URL: process.env.NETLIFY_DATABASE_URL ? 'SET ✅' : 'NOT SET ❌',
      LINKEDIN_CLIENT_ID: process.env.LINKEDIN_CLIENT_ID ? 'SET ✅' : 'NOT SET ❌',
      LINKEDIN_CLIENT_SECRET: process.env.LINKEDIN_CLIENT_SECRET ? 'SET ✅' : 'NOT SET ❌',
      LINKEDIN_REDIRECT_URI: process.env.LINKEDIN_REDIRECT_URI ? 'SET ✅' : 'NOT SET ❌',
    }, null, 2),
  };
};
