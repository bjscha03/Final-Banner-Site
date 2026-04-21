function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeShippingAddress(input) {
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

module.exports = {
  normalizeShippingAddress,
  hasShippingAddress,
  formatShippingCityStatePostal,
};
