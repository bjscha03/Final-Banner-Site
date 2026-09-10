// Simple test to check cart calculation
const quote = {
  widthIn: 48,
  heightIn: 24,
  quantity: 1,
  material: '13oz',
  grommets: 'none',
  polePockets: 'none',
  addRope: false
};

// Simulate the cart calculation
const area = (quote.widthIn * quote.heightIn) / 144;
const pricePerSqFt = {
  '13oz': 4.5,
  '15oz': 6.0,
  '18oz': 7.5,
  'mesh': 6.0
}[quote.material];

const unitPriceCents = Math.round(area * pricePerSqFt * 100);

console.log("Test calculation:");
console.log("Area:", area);
console.log("Price per sq ft:", pricePerSqFt);
console.log("Unit price cents:", unitPriceCents);
console.log("Unit price dollars:", unitPriceCents / 100);
