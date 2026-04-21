function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function pick(...values) {
  return values.map(clean).find(Boolean) || '';
}

function readLegacyShippingAddress(value) {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return value && typeof value === 'object' ? value : {};
}

function normalizeShippingAddress(input) {
  const source = input || {};
  const legacyShippingAddress = readLegacyShippingAddress(source.shipping_address);
  const nestedShippingAddress = source.shippingAddress;
  const nested = nestedShippingAddress && typeof nestedShippingAddress === 'object'
    ? nestedShippingAddress
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

function hasShippingAddress(address) {
  return Boolean(
    address?.name ||
    address?.line1 ||
    address?.line2 ||
    address?.city ||
    address?.state ||
    address?.postalCode ||
    (address?.country && address.country !== 'US')
  );
}

function formatShippingCityStatePostal(address) {
  const cityState = [address?.city || '', address?.state || ''].filter(Boolean).join(', ');
  return [cityState, address?.postalCode || ''].filter(Boolean).join(' ');
}

function formatShippingAddress(address) {
  const cityStatePostal = formatShippingCityStatePostal(address || {});
  return [
    address?.name || '',
    address?.line1 || '',
    address?.line2 || '',
    cityStatePostal,
    address?.country && address.country !== 'US' ? address.country : '',
  ].filter(Boolean);
}

module.exports = {
  normalizeShippingAddress,
  hasShippingAddress,
  formatShippingCityStatePostal,
  formatShippingAddress,
};
