const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

exports.handler = async (event) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    // Fetch all carts using Supabase REST API directly (no SDK needed)
    const fetchResponse = await fetch(`${supabaseUrl}/rest/v1/user_carts?select=*`, {
      headers: {
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!fetchResponse.ok) {
      throw new Error(`Failed to fetch carts: ${fetchResponse.statusText}`);
    }

    const carts = await fetchResponse.json();
    console.log(`Found ${carts?.length || 0} carts to check`);

    let fixedCount = 0;
    let totalItemsFixed = 0;

    for (const cart of carts || []) {
      let cartData = cart.cart_data || [];
      let modified = false;

      // Check each item in the cart
      const cleanedData = cartData.map((item) => {
        let itemModified = false;

        // Remove blob URLs
        if (item.file_url?.startsWith('blob:')) {
          console.log(`Removing blob file_url from item ${item.id}`);
          item.file_url = null;
          itemModified = true;
        }

        if (item.web_preview_url?.startsWith('blob:')) {
          console.log(`Removing blob web_preview_url from item ${item.id}`);
          item.web_preview_url = null;
          itemModified = true;
        }

        if (item.print_ready_url?.startsWith('blob:')) {
          console.log(`Removing blob print_ready_url from item ${item.id}`);
          item.print_ready_url = null;
          itemModified = true;
        }

        if (itemModified) {
          totalItemsFixed++;
          modified = true;
        }

        return item;
      });

      // Update the cart if any items were modified
      if (modified) {
        const updateResponse = await fetch(`${supabaseUrl}/rest/v1/user_carts?id=eq.${cart.id}`, {
          method: 'PATCH',
          headers: {
            'apikey': supabaseServiceKey,
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({ cart_data: cleanedData }),
        });

        if (!updateResponse.ok) {
          console.error(`Error updating cart ${cart.id}:`, updateResponse.statusText);
        } else {
          fixedCount++;
          console.log(`Fixed cart ${cart.id}`);
        }
      }
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        success: true,
        message: `Fixed ${fixedCount} carts with ${totalItemsFixed} items containing blob URLs`,
        cartsFixed: fixedCount,
        itemsFixed: totalItemsFixed,
      }),
    };
  } catch (error) {
    console.error('Error fixing blob URLs:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};
