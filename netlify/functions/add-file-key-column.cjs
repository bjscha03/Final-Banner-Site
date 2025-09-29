const { neon } = require('@neondatabase/serverless');

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

exports.handler = async (event, context) => {
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
    const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    if (!dbUrl) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          ok: false,
          error: 'Database not configured'
        })
      };
    }

    const sql = neon(dbUrl);

    console.log('Starting file_key column migration...');

    // Check if file_key column already exists
    const columnCheck = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'order_items' 
        AND column_name = 'file_key'
    `;

    if (columnCheck.length > 0) {
      console.log('file_key column already exists');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: true,
          message: 'file_key column already exists',
          columnExists: true
        })
      };
    }

    // Add file_key column
    console.log('Adding file_key column...');
    await sql`
      ALTER TABLE order_items 
      ADD COLUMN file_key VARCHAR(255)
    `;

    // Add index for performance
    console.log('Adding index for file_key...');
    await sql`
      CREATE INDEX IF NOT EXISTS idx_order_items_file_key 
      ON order_items(file_key)
    `;

    // Verify the column was added
    const verifyColumn = await sql`
      SELECT 
        column_name,
        data_type,
        is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'order_items' 
        AND column_name = 'file_key'
    `;

    console.log('Migration completed successfully');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        message: 'file_key column added successfully',
        columnInfo: verifyColumn[0] || null,
        columnExists: true
      })
    };

  } catch (error) {
    console.error('Migration failed:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        ok: false,
        error: 'Migration failed',
        details: error.message
      })
    };
  }
};
