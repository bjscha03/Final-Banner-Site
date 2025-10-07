#!/bin/bash

FILE="src/components/home/QuickQuote.tsx"

# Fix the main section background and styling
sed -i '' 's/className="py-20 bg-slate-50 relative overflow-hidden"/className="bg-white py-12"/' "$FILE"

# Remove the decorative background pattern section
sed -i '' '/<!-- Background Pattern -->/,/^      <\/div>$/d' "$FILE"
sed -i '' '/\/\* Background Pattern \*\//,/^      <\/div>$/d' "$FILE"

# Fix the container max-width
sed -i '' 's/max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10/max-w-7xl mx-auto px-4 sm:px-6 lg:px-8/' "$FILE"

# Fix the header styling
sed -i '' 's/text-5xl md:text-6xl font-bold text-slate-900 mb-6/text-3xl font-bold text-slate-900 mb-3/' "$FILE"
sed -i '' 's/text-xl text-slate-700 max-w-3xl mx-auto leading-relaxed/text-lg text-slate-600/' "$FILE"
sed -i '' 's/mb-16/mb-10/' "$FILE"

# Fix the card styling - remove decorative elements
sed -i '' 's/bg-white border-2 border-slate-200 border border-orange-200\/40 rounded-3xl overflow-hidden shadow-2xl backdrop-blur-sm/bg-white border border-slate-200 rounded-lg overflow-hidden/' "$FILE"

echo "✅ QuickQuote styling updated to match Amazon-style design!"
