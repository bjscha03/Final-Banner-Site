const LEGACY_ASSET_REPAIRS = [
  {
    orderIdSuffix: 'f66db659',
    fileUrl: 'https://res.cloudinary.com/dtrxl120u/image/upload/v1784612625/uploads/IMG_1300_dck2i7.jpg',
    fileKey: 'uploads/IMG_1300_dck2i7',
  },
];

function findLegacyAssetRepair(order) {
  const orderId = String(order?.id || '').toLowerCase();
  return LEGACY_ASSET_REPAIRS.find((repair) => orderId.endsWith(repair.orderIdSuffix)) || null;
}

function withLegacyAssetRepair(order, item) {
  const repair = findLegacyAssetRepair(order);
  if (!repair || !item) return item;

  return {
    ...item,
    file_url: item.file_url || repair.fileUrl,
    thumbnail_url: item.thumbnail_url || repair.fileUrl,
    file_key: item.file_key || repair.fileKey,
  };
}

async function persistLegacyAssetRepair(sql, order, item) {
  const repair = findLegacyAssetRepair(order);
  if (!repair || !sql || !item?.id) return false;
  if (item.file_url && item.thumbnail_url && item.file_key) return false;

  await sql`
    UPDATE order_items
    SET file_url = COALESCE(NULLIF(file_url, ''), ${repair.fileUrl}),
        thumbnail_url = COALESCE(NULLIF(thumbnail_url, ''), ${repair.fileUrl}),
        file_key = COALESCE(NULLIF(file_key, ''), ${repair.fileKey})
    WHERE id = ${item.id}
  `;
  return true;
}

async function persistLegacyAssetRepairs(sql, order, items) {
  if (!Array.isArray(items) || !findLegacyAssetRepair(order)) return;

  for (const item of items) {
    try {
      const repaired = await persistLegacyAssetRepair(sql, order, item);
      if (repaired) {
        console.log('[legacy-order-asset-repairs] Backfilled assets for order item', item.id);
      }
    } catch (error) {
      console.warn('[legacy-order-asset-repairs] Failed to backfill order item', item?.id, error?.message || error);
    }
  }
}

function applyLegacyAssetRepairs(order, items) {
  if (!Array.isArray(items)) return items;
  return items.map((item) => withLegacyAssetRepair(order, item));
}

module.exports = {
  applyLegacyAssetRepairs,
  persistLegacyAssetRepairs,
};
