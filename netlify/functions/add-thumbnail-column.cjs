// One-time migration: Add thumbnail_url column to order_items table
const { neon } = require("@neondatabase/serverless");

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Database not configured" }) };
  }

  const sql = neon(dbUrl);

  try {
    await sql`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS thumbnail_url TEXT`;
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, message: "thumbnail_url column added" }) };
  } catch (error) {
    console.error("Migration error:", error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};
