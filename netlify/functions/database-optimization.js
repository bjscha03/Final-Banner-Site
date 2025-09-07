const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.NETLIFY_DATABASE_URL);

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const { operation } = JSON.parse(event.body);
    console.log(`🚀 Running database optimization: ${operation}`);

    let result;

    switch (operation) {
      case 'validation':
        result = await runValidation();
        break;
      case 'money-optimization':
        result = await runMoneyOptimization();
        break;
      case 'user-association':
        result = await runUserAssociation();
        break;
      case 'performance':
        result = await runPerformanceOptimization();
        break;
      case 'verification':
        result = await runVerification();
        break;
      case 'rollback':
        result = await runRollback();
        break;
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        operation,
        result
      }),
    };

  } catch (error) {
    console.error(`Database optimization error:`, error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        success: false,
        error: error.message,
        details: error.stack
      }),
    };
  }
};

async function runValidation() {
  console.log('🔍 Running pre-migration validation...');
  
  const results = {
    orderCount: 0,
    userCount: 0,
    ordersWithUsers: 0,
    ordersWithoutUsers: 0,
    guestOrders: 0,
    moneyConsistency: true,
    issues: []
  };

  // Check order count
  const [{ count: orderCount }] = await sql`SELECT COUNT(*)::int as count FROM orders`;
  results.orderCount = orderCount;

  // Check user count
  const [{ count: userCount }] = await sql`SELECT COUNT(*)::int as count FROM profiles`;
  results.userCount = userCount;

  // Check user associations
  const [{ count: ordersWithUsers }] = await sql`SELECT COUNT(*)::int as count FROM orders WHERE user_id IS NOT NULL`;
  results.ordersWithUsers = ordersWithUsers;
  results.ordersWithoutUsers = orderCount - ordersWithUsers;

  // Check guest orders
  const [{ count: guestOrders }] = await sql`SELECT COUNT(*)::int as count FROM orders WHERE email = 'guest@example.com'`;
  results.guestOrders = guestOrders;

  // Check money consistency (all cents values should be integers)
  const invalidMoney = await sql`
    SELECT COUNT(*) as count FROM orders 
    WHERE subtotal_cents IS NULL OR tax_cents IS NULL OR total_cents IS NULL
       OR subtotal_cents < 0 OR tax_cents < 0 OR total_cents < 0
  `;
  
  if (invalidMoney[0].count > 0) {
    results.moneyConsistency = false;
    results.issues.push(`${invalidMoney[0].count} orders have invalid money values`);
  }

  // Check for orphaned orders (user_id exists but user doesn't)
  const orphanedOrders = await sql`
    SELECT COUNT(*) as count FROM orders o
    LEFT JOIN profiles p ON o.user_id = p.id
    WHERE o.user_id IS NOT NULL AND p.id IS NULL
  `;
  
  if (orphanedOrders[0].count > 0) {
    results.issues.push(`${orphanedOrders[0].count} orders reference non-existent users`);
  }

  console.log('✅ Validation completed:', results);
  return results;
}

async function runMoneyOptimization() {
  console.log('💰 Running money handling optimization...');
  
  const results = {
    columnsAdded: [],
    viewCreated: false,
    errors: []
  };

  try {
    // Add generated dollar columns (safe - won't fail if they already exist)
    await sql`
      DO $$ BEGIN
        ALTER TABLE public.orders
          ADD COLUMN IF NOT EXISTS subtotal numeric(10,2) GENERATED ALWAYS AS (round(subtotal_cents::numeric/100,2)) STORED,
          ADD COLUMN IF NOT EXISTS tax      numeric(10,2) GENERATED ALWAYS AS (round(tax_cents::numeric/100,2)) STORED,
          ADD COLUMN IF NOT EXISTS total    numeric(10,2) GENERATED ALWAYS AS (round(total_cents::numeric/100,2)) STORED;
      EXCEPTION WHEN duplicate_column THEN NULL; END $$;
    `;
    results.columnsAdded.push('subtotal', 'tax', 'total');

    // Ensure currency column exists
    await sql`
      DO $$ BEGIN
        ALTER TABLE public.orders
          ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'usd';
      EXCEPTION WHEN duplicate_column THEN NULL; END $$;
    `;
    results.columnsAdded.push('currency');

    // Create UI-friendly view
    await sql`
      CREATE OR REPLACE VIEW public.orders_read AS
      SELECT
        o.id, o.user_id, o.email, o.status, o.created_at, o.updated_at,
        o.subtotal, o.tax, o.total, o.currency,
        o.tracking_number
      FROM public.orders o;
    `;
    results.viewCreated = true;

    console.log('✅ Money optimization completed:', results);
    return results;

  } catch (error) {
    results.errors.push(error.message);
    throw error;
  }
}

async function runUserAssociation() {
  console.log('👥 Running user-order association enhancement...');
  
  const results = {
    ordersBackfilled: 0,
    indexesCreated: [],
    errors: []
  };

  try {
    // Backfill: Associate orders with users where email matches
    const backfillResult = await sql`
      UPDATE public.orders o
      SET user_id = p.id
      FROM public.profiles p
      WHERE o.user_id IS NULL
        AND lower(o.email) = lower(p.email)
        AND o.email != 'guest@example.com'
    `;
    results.ordersBackfilled = backfillResult.count || 0;

    // Create performance index for My Orders queries
    await sql`CREATE INDEX IF NOT EXISTS idx_orders_user_created ON public.orders(user_id, created_at DESC)`;
    results.indexesCreated.push('idx_orders_user_created');

    // Create index for email lookups
    await sql`CREATE INDEX IF NOT EXISTS idx_orders_email ON public.orders(email)`;
    results.indexesCreated.push('idx_orders_email');

    console.log('✅ User association enhancement completed:', results);
    return results;

  } catch (error) {
    results.errors.push(error.message);
    throw error;
  }
}

async function runPerformanceOptimization() {
  console.log('⚡ Running performance optimization...');
  
  const results = {
    indexesCreated: [],
    constraintsAdded: [],
    errors: []
  };

  try {
    // Create additional performance indexes
    await sql`CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status)`;
    results.indexesCreated.push('idx_orders_status');

    await sql`CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC)`;
    results.indexesCreated.push('idx_orders_created_at');

    await sql`CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email)`;
    results.indexesCreated.push('idx_profiles_email');

    // Add check constraints for data integrity (non-breaking)
    await sql`
      DO $$ BEGIN
        ALTER TABLE public.orders
          ADD CONSTRAINT IF NOT EXISTS chk_orders_money_positive 
          CHECK (subtotal_cents >= 0 AND tax_cents >= 0 AND total_cents >= 0);
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `;
    results.constraintsAdded.push('chk_orders_money_positive');

    console.log('✅ Performance optimization completed:', results);
    return results;

  } catch (error) {
    results.errors.push(error.message);
    throw error;
  }
}

async function runVerification() {
  console.log('✅ Running post-migration verification...');
  
  const results = {
    moneyColumnsWorking: false,
    viewWorking: false,
    indexesExist: false,
    dataIntegrity: true,
    sampleData: {},
    errors: []
  };

  try {
    // Test generated money columns
    const moneyTest = await sql`
      SELECT total_cents, total FROM orders 
      WHERE total_cents IS NOT NULL 
      ORDER BY created_at DESC LIMIT 3
    `;
    results.moneyColumnsWorking = moneyTest.length > 0 && moneyTest[0].total !== null;
    results.sampleData.moneyTest = moneyTest;

    // Test orders_read view
    const viewTest = await sql`
      SELECT id, total, currency FROM orders_read 
      ORDER BY created_at DESC LIMIT 3
    `;
    results.viewWorking = viewTest.length > 0;
    results.sampleData.viewTest = viewTest;

    // Check indexes exist
    const indexCheck = await sql`
      SELECT indexname FROM pg_indexes 
      WHERE tablename = 'orders' 
      AND indexname LIKE 'idx_orders_%'
    `;
    results.indexesExist = indexCheck.length > 0;
    results.sampleData.indexes = indexCheck.map(i => i.indexname);

    // Verify no data corruption
    const [{ count: totalOrders }] = await sql`SELECT COUNT(*)::int as count FROM orders`;
    const [{ count: validMoney }] = await sql`
      SELECT COUNT(*)::int as count FROM orders 
      WHERE subtotal_cents >= 0 AND tax_cents >= 0 AND total_cents >= 0
    `;
    
    results.dataIntegrity = totalOrders === validMoney;
    results.sampleData.orderCounts = { total: totalOrders, validMoney };

    console.log('✅ Verification completed:', results);
    return results;

  } catch (error) {
    results.errors.push(error.message);
    throw error;
  }
}

async function runRollback() {
  console.log('🔄 Running rollback...');
  
  const results = {
    columnsDropped: [],
    viewDropped: false,
    indexesDropped: [],
    errors: []
  };

  try {
    // Drop generated columns (this is safe and reversible)
    await sql`
      DO $$ BEGIN
        ALTER TABLE public.orders 
          DROP COLUMN IF EXISTS subtotal,
          DROP COLUMN IF EXISTS tax,
          DROP COLUMN IF EXISTS total;
      EXCEPTION WHEN undefined_column THEN NULL; END $$;
    `;
    results.columnsDropped.push('subtotal', 'tax', 'total');

    // Drop view
    await sql`DROP VIEW IF EXISTS public.orders_read`;
    results.viewDropped = true;

    // Drop performance indexes (keep essential ones)
    await sql`DROP INDEX IF EXISTS idx_orders_user_created`;
    await sql`DROP INDEX IF EXISTS idx_orders_email`;
    await sql`DROP INDEX IF EXISTS idx_orders_status`;
    await sql`DROP INDEX IF EXISTS idx_orders_created_at`;
    results.indexesDropped.push('idx_orders_user_created', 'idx_orders_email', 'idx_orders_status', 'idx_orders_created_at');

    console.log('✅ Rollback completed:', results);
    return results;

  } catch (error) {
    results.errors.push(error.message);
    throw error;
  }
}
