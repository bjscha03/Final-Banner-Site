#!/bin/bash

FILE="src/components/home/QuickQuote.tsx"

# Fix header backgrounds - change from amber to orange
sed -i '' 's/bg-amber-500/bg-orange-500/g' "$FILE"
sed -i '' 's/bg-amber-600/bg-orange-600/g' "$FILE"
sed -i '' 's/text-amber-500/text-orange-500/g' "$FILE"
sed -i '' 's/text-amber-600/text-orange-600/g' "$FILE"
sed -i '' 's/border-amber-/border-orange-/g' "$FILE"
sed -i '' 's/from-amber-/from-orange-/g' "$FILE"
sed -i '' 's/to-amber-/to-orange-/g' "$FILE"

# Simplify rounded corners
sed -i '' 's/rounded-3xl/rounded-lg/g' "$FILE"
sed -i '' 's/rounded-2xl/rounded-lg/g' "$FILE"

# Remove shadow-2xl, use simpler shadows
sed -i '' 's/shadow-2xl/shadow-lg/g' "$FILE"

echo "✅ QuickQuote colors and styling cleaned up!"
