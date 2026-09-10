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
  line1?: string | null;
  line2?: string | null;
  address1?: string | null;
  address2?: string | null;
  street?: string | null;
  street2?: string | null;
  zip?: string | null;
  postal_code?: string | null;
  shipping_name?: string | null;
  shipping_street?: string | null;
  shipping_street2?: string | null;
  shipping_city?: string | null;
  shipping_state?: string | null;
  shipping_zip?: string | null;
  shipping_country?: string | null;
  shipping_address?: unknown;
  customer_name?: string | null;
};

const clean = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const pick = (...values: unknown[]): string => values.map(clean).find(Boolean) || '';

const readLegacyShippingAddress = (value: unknown): Record<string, unknown> => {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
};

export function normalizeShippingAddress(input: ShippingAddressInput | null | undefined): ShippingAddress {
  const source = input || {};
  const legacyShippingAddress = readLegacyShippingAddress(source.shipping_address);
  const nestedShippingAddress = (source as { shippingAddress?: unknown }).shippingAddress;
  const nested = nestedShippingAddress && typeof nestedShippingAddress === 'object'
    ? (nestedShippingAddress as Record<string, unknown>)
    : {};
  return {
    name: pick(source.name, nested.name, legacyShippingAddress.name, source.shipping_name, source.customer_name),
    line1: pick(
      source.line1,
      source.street,
      source.address1,
      nested.line1,
      nested.street,
      nested.address1,
      legacyShippingAddress.line1,
      legacyShippingAddress.street,
      legacyShippingAddress.address1,
      source.shipping_street
    ),
    line2: pick(
      source.line2,
      source.street2,
      source.address2,
      nested.line2,
      nested.street2,
      nested.address2,
      legacyShippingAddress.line2,
      legacyShippingAddress.street2,
      legacyShippingAddress.address2,
      source.shipping_street2
    ),
    city: pick(source.city, nested.city, legacyShippingAddress.city, source.shipping_city),
    state: pick(source.state, nested.state, legacyShippingAddress.state, source.shipping_state),
    postalCode: pick(
      source.postalCode,
      source.zip,
      source.postal_code,
      nested.postalCode,
      nested.zip,
      nested.postal_code,
      legacyShippingAddress.postalCode,
      legacyShippingAddress.zip,
      legacyShippingAddress.postal_code,
      source.shipping_zip
    ),
    country: pick(source.country, nested.country, legacyShippingAddress.country, source.shipping_country) || 'US',
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

export function formatShippingAddress(address: ShippingAddress): string[] {
  const cityStatePostal = formatShippingCityStatePostal(address);
  return [
    address.name,
    address.line1,
    address.line2,
    cityStatePostal,
    address.country && address.country !== 'US' ? address.country : '',
  ].filter(Boolean);
}
