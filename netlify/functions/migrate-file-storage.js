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

    console.log('Starting file storage migration...');

    // Create uploaded_files table if it doesn't exist
    await sql`
      CREATE TABLE IF NOT EXISTS uploaded_files (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        file_key VARCHAR(255) UNIQUE NOT NULL,
        original_filename VARCHAR(255),
        file_size INTEGER,
        mime_type VARCHAR(100),
        file_content_base64 TEXT,
        upload_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        status VARCHAR(20) DEFAULT 'uploaded',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;

    // Add file_content_base64 column if it doesn't exist
    await sql`
      ALTER TABLE uploaded_files 
      ADD COLUMN IF NOT EXISTS file_content_base64 TEXT
    `;

    // Add indexes for performance
    await sql`
      CREATE INDEX IF NOT EXISTS idx_uploaded_files_file_key 
      ON uploaded_files(file_key)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_uploaded_files_status 
      ON uploaded_files(status)
    `;

    // Verify the table structure
    const tableInfo = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'uploaded_files' 
      ORDER BY ordinal_position
    `;

    console.log('Migration completed successfully');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        message: 'File storage migration completed successfully',
        tableStructure: tableInfo
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
