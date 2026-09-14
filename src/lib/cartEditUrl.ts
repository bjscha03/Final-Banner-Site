import type { CartItem } from '@/store/cart';

export function cartEditUrl(item: Pick<CartItem, 'id' | 'source' | 'product_type'>): string {
  const route = item.source === 'google-ads' ? '/google-ads-banner' : '/design';
  const product = item.product_type === 'yard_sign' ? 'yard-signs' : item.product_type === 'car_magnet' ? 'car-magnets' : 'banner';
  return `${route}?product=${product}&editItem=${encodeURIComponent(item.id)}`;
}
