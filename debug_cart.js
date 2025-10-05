// Debug script to check cart data
const fs = require('fs');

// This would normally be in localStorage, but let's check the cart structure
console.log("Checking cart item structure...");

// Sample cart item structure that should exist
const expectedFields = [
  'id', 'width_in', 'height_in', 'quantity', 'material', 'grommets', 
  'pole_pockets', 'rope_feet', 'pole_pocket_cost_cents', 'area_sqft',
  'unit_price_cents', 'line_total_cents', 'file_key', 'file_name', 
  'file_url', 'created_at'
];

console.log("Expected CartItem fields:", expectedFields);
console.log("Critical field for display: line_total_cents");
