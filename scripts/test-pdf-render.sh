#!/bin/bash
# Test script for PDF rendering function
set -e

echo "🧪 Testing PDF Rendering Function"
echo "=================================="
echo ""

# Check if netlify dev is running
if ! curl -s http://localhost:8888 > /dev/null 2>&1; then
    echo "❌ Error: Netlify dev server is not running"
    echo "   Please run 'netlify dev' in another terminal first"
    exit 1
fi

echo "✅ Netlify dev server is running"
echo ""

# Test 1: Small banner
echo "Test 1: Small banner (24\" x 12\")"
curl -X POST http://localhost:8888/.netlify/functions/render-order-pdf \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "test-small",
    "bannerWidthIn": 24,
    "bannerHeightIn": 12,
    "previewCanvasPx": {"width": 800, "height": 400},
    "imageUrl": "https://res.cloudinary.com/demo/image/upload/sample.jpg",
    "imageSource": "upload",
    "transform": {"scale": 1.0, "translateXpx": 0, "translateYpx": 0}
  }'

echo ""
echo "🎉 Test complete!"
