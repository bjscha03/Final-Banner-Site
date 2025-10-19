const { neon } = require('@neondatabase/serverless');
const { generateSlug, transformToCloudinaryFetch, generateAutoSummary } = require('./utils/eventHelpers.cjs');

function checkAdminAuth(event) {
  const authHeader = event.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  return token.length > 0;
}

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  if (!checkAdminAuth(event)) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };

  try {
    const DATABASE_URL = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL || process.env.VITE_DATABASE_URL;
    if (!DATABASE_URL) throw new Error('DATABASE_URL not configured');

    const sql = neon(DATABASE_URL);
    const body = JSON.parse(event.body);
    const events = body.events || [];
    const dryRun = body.dry_run !== false;
    const upsert = body.upsert === true;

    if (!Array.isArray(events)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'events must be an array' }) };

    const categories = await sql`SELECT id, name, slug FROM event_categories`;
    const categoryMap = {};
    categories.forEach(cat => { categoryMap[cat.slug] = cat; });

    const results = { total: events.length, inserted: 0, updated: 0, skipped: 0, errors: [] };
    const normalizedEvents = [];

    for (let i = 0; i < events.length; i++) {
      const eventData = events[i];
      
      try {
        const required = ['title', 'category_slug', 'city', 'state', 'start_at'];
        const missing = required.filter(field => !eventData[field]);
        
        if (missing.length > 0) {
          results.errors.push(`Event ${i + 1}: Missing fields: ${missing.join(', ')}`);
          results.skipped++;
          continue;
        }

        const category = categoryMap[eventData.category_slug];
        if (!category) {
          results.errors.push(`Event ${i + 1}: Invalid category: ${eventData.category_slug}`);
          results.skipped++;
          continue;
        }

        let slug = eventData.slug || generateSlug(eventData.title);
        const existing = await sql`SELECT id FROM events WHERE slug = ${slug} LIMIT 1`;

        if (existing.length > 0 && !upsert) {
          results.errors.push(`Event ${i + 1}: Slug already exists: ${slug}`);
          results.skipped++;
          continue;
        }

        const imageUrl = eventData.image_url ? transformToCloudinaryFetch(eventData.image_url) : null;
        let summaryShort = eventData.summary_short || eventData.description || '';
        if (!summaryShort) {
          summaryShort = generateAutoSummary({
            title: eventData.title,
            category_name: category.name,
            city: eventData.city,
            state: eventData.state,
            start_at: eventData.start_at,
            venue: eventData.venue || null
          });
        }

        const normalizedEvent = {
          title: eventData.title,
          slug,
          category_id: category.id,
          summary_short: summaryShort.substring(0, 500),
          description: eventData.description || null,
          external_url: eventData.external_url || null,
          image_url: imageUrl,
          venue: eventData.venue || null,
          city: eventData.city,
          state: eventData.state.toUpperCase(),
          start_at: eventData.start_at,
          end_at: eventData.end_at || null,
          recommended_material: eventData.recommended_material || null,
          popular_sizes: eventData.popular_sizes || null,
          is_featured: eventData.is_featured || false,
          status: eventData.status || 'approved'
        };

        normalizedEvents.push(normalizedEvent);

        if (!dryRun) {
          if (existing.length > 0 && upsert) {
            await sql`
              UPDATE events SET
                title = ${normalizedEvent.title},
                category_id = ${normalizedEvent.category_id},
                summary_short = ${normalizedEvent.summary_short},
                description = ${normalizedEvent.description},
                external_url = ${normalizedEvent.external_url},
                image_url = ${normalizedEvent.image_url},
                venue = ${normalizedEvent.venue},
                city = ${normalizedEvent.city},
                state = ${normalizedEvent.state},
                start_at = ${normalizedEvent.start_at},
                end_at = ${normalizedEvent.end_at},
                recommended_material = ${normalizedEvent.recommended_material},
                popular_sizes = ${normalizedEvent.popular_sizes},
                is_featured = ${normalizedEvent.is_featured},
                status = ${normalizedEvent.status}
              WHERE slug = ${slug}
            `;
            results.updated++;
          } else {
            await sql`
              INSERT INTO events (
                title, slug, category_id, summary_short, description,
                external_url, image_url, venue, city, state,
                start_at, end_at, recommended_material, popular_sizes,
                is_featured, status
              ) VALUES (
                ${normalizedEvent.title}, ${normalizedEvent.slug}, ${normalizedEvent.category_id},
                ${normalizedEvent.summary_short}, ${normalizedEvent.description},
                ${normalizedEvent.external_url}, ${normalizedEvent.image_url},
                ${normalizedEvent.venue}, ${normalizedEvent.city}, ${normalizedEvent.state},
                ${normalizedEvent.start_at}, ${normalizedEvent.end_at},
                ${normalizedEvent.recommended_material}, ${normalizedEvent.popular_sizes},
                ${normalizedEvent.is_featured}, ${normalizedEvent.status}
              )
            `;
            results.inserted++;
          }
        } else {
          if (existing.length > 0 && upsert) {
            results.updated++;
          } else if (existing.length === 0) {
            results.inserted++;
          }
        }
      } catch (error) {
        results.errors.push(`Event ${i + 1}: ${error.message}`);
        results.skipped++;
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        dry_run: dryRun,
        results,
        normalized_events: normalizedEvents
      })
    };
  } catch (error) {
    console.error('Error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};
