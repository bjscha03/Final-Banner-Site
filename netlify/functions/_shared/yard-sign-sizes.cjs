const catalog = require('../../../shared/yard-sign-sizes.json');
function findYardSignSize(width, height) {
  return catalog.sizes.find(size => size.widthIn === Number(width) && size.heightIn === Number(height));
}
function yardSignSizeLabel(item) {
  if (item.width_in == null && item.height_in == null) return catalog.sizes[0].label;
  return findYardSignSize(item.width_in, item.height_in)?.label || `${item.width_in}" × ${item.height_in}"`;
}
function validYardSignQuantity(quantity, size) {
  return Boolean(size && Number.isInteger(quantity) && quantity >= size.minQuantity
    && quantity <= size.maxQuantity && quantity % size.increment === 0);
}
module.exports = { ...catalog, findYardSignSize, yardSignSizeLabel, validYardSignQuantity };
