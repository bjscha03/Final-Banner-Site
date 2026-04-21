export type ShippingAddress = {
  name: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

type ShippingAddressInput = Partial<ShippingAddress> & {
  shipping_name?: string | null;
  shipping_street?: string | null;
  shipping_street2?: string | null;
  shipping_city?: string | null;
  shipping_state?: string | null;
  shipping_zip?: string | null;
  shipping_country?: string | null;
  customer_name?: string | null;
};

const clean = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

export function normalizeShippingAddress(input: ShippingAddressInput | null | undefined): ShippingAddress {
  const source = input || {};
  return {
    name: clean(source.name) || clean(source.shipping_name) || clean(source.customer_name),
    line1: clean(source.line1) || clean(source.shipping_street),
    line2: clean(source.line2) || clean(source.shipping_street2),
    city: clean(source.city) || clean(source.shipping_city),
    state: clean(source.state) || clean(source.shipping_state),
    postalCode: clean(source.postalCode) || clean(source.shipping_zip),
    country: clean(source.country) || clean(source.shipping_country) || 'US',
  };
}

export function hasShippingAddress(address: ShippingAddress): boolean {
  return Boolean(
    address.name ||
    address.line1 ||
    address.line2 ||
    address.city ||
    address.state ||
    address.postalCode ||
    (address.country && address.country !== 'US')
  );
}

export function formatShippingCityStatePostal(address: ShippingAddress): string {
  const cityState = [address.city, address.state].filter(Boolean).join(', ');
  return [cityState, address.postalCode].filter(Boolean).join(' ');
}
