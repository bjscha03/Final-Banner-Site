function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
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
    name: clean(source.name) || clean(nested.name) || clean(legacyShippingAddress.name) || clean(source.shipping_name) || clean(source.customer_name),
    line1: clean(source.line1) || clean(source.street) || clean(source.address1) || clean(nested.line1) || clean(nested.street) || clean(nested.address1) || clean(legacyShippingAddress.line1) || clean(legacyShippingAddress.street) || clean(legacyShippingAddress.address1) || clean(source.shipping_street),
    line2: clean(source.line2) || clean(source.street2) || clean(source.address2) || clean(nested.line2) || clean(nested.street2) || clean(nested.address2) || clean(legacyShippingAddress.line2) || clean(legacyShippingAddress.street2) || clean(legacyShippingAddress.address2) || clean(source.shipping_street2),
    city: clean(source.city) || clean(nested.city) || clean(legacyShippingAddress.city) || clean(source.shipping_city),
    state: clean(source.state) || clean(nested.state) || clean(legacyShippingAddress.state) || clean(source.shipping_state),
    postalCode: clean(source.postalCode) || clean(source.zip) || clean(source.postal_code) || clean(nested.postalCode) || clean(nested.zip) || clean(nested.postal_code) || clean(legacyShippingAddress.postalCode) || clean(legacyShippingAddress.zip) || clean(legacyShippingAddress.postal_code) || clean(source.shipping_zip),
    country: clean(source.country) || clean(nested.country) || clean(legacyShippingAddress.country) || clean(source.shipping_country) || 'US',
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
