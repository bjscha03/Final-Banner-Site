#!/bin/bash

FILE="src/components/home/QuickQuote.tsx"

# Fix the "Start My Design" button to have proper orange with white text
sed -i '' 's/className=".*bg-orange-50.*hover:bg-orange-100.*"/className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors"/' "$FILE"

# Fix any remaining harsh color combinations
# Change peach/orange text on orange backgrounds to white
sed -i '' 's/bg-orange-50 text-slate-700/bg-orange-500 text-white/g' "$FILE"

# Make sure the price display uses a nice green
sed -i '' 's/text-slate-600 text-3xl/text-emerald-600 text-3xl/g' "$FILE"

echo "✅ QuickQuote buttons and key elements fixed!"
