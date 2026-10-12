import type { CartItem } from '@/store/cart';

export function cartEditUrl(item: Pick<CartItem, 'id' | 'source' | 'product_type' | 'specialty_config'> & Partial<Pick<CartItem, 'material'>>): string {
  if (item.product_type === 'specialty' && item.specialty_config) return `/products/${encodeURIComponent(item.specialty_config.productSlug)}?editItem=${encodeURIComponent(item.id)}`;
  const route = item.source === 'google-ads' ? '/google-ads-banner' : '/design';
  const product = item.product_type === 'yard_sign' ? 'yard-signs' : item.product_type === 'car_magnet' ? 'car-magnets' : 'banner';
  return `${route}?product=${product}${item.material === '18oz_double' ? '&sides=double' : ''}&editItem=${encodeURIComponent(item.id)}`;
}
