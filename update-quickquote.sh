#!/bin/bash
# Update QuickQuote component - Remove all gradients, apply orange branding

echo "🎨 Updating QuickQuote component..."

FILE="src/components/home/QuickQuote.tsx"

# Backup
cp "$FILE" "${FILE}.backup-$(date +%s)"

# Main section background - Remove blue/indigo gradient
sed -i.tmp 's/bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100/bg-slate-50/g' "$FILE"

# Decorative blur elements - Change blue/indigo to orange
sed -i.tmp 's/from-blue-400\/30 to-blue-600\/30/from-orange-400\/20 to-orange-600\/20/g' "$FILE"
sed -i.tmp 's/from-indigo-400\/20 to-indigo-600\/20/from-orange-400\/15 to-orange-600\/15/g' "$FILE"

# Header backgrounds - Remove gradients
sed -i.tmp 's/bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50/bg-orange-50/g' "$FILE"
sed -i.tmp 's/bg-gradient-to-r from-blue-50 to-indigo-50/bg-orange-50/g' "$FILE"

# Icon containers - Remove purple/pink/blue gradients, use orange
sed -i.tmp 's/bg-gradient-to-br from-purple-500 to-pink-600/bg-orange-500/g' "$FILE"
sed -i.tmp 's/bg-gradient-to-br from-blue-500 to-indigo-600/bg-orange-500/g' "$FILE"
sed -i.tmp 's/bg-gradient-to-br from-purple-600 to-pink-600/bg-amber-500/g' "$FILE"

# Card backgrounds - Remove gradients
sed -i.tmp 's/bg-gradient-to-br from-white via-blue-50\/30 to-indigo-50\/20/bg-white border-2 border-slate-200/g' "$FILE"
sed -i.tmp 's/bg-gradient-to-br from-white to-gray-50/bg-white/g' "$FILE"

# Button gradients - Replace with solid orange
sed -i.tmp 's/bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600/bg-orange-500 hover:bg-orange-600/g' "$FILE"
sed -i.tmp 's/bg-gradient-to-r from-purple-600 to-pink-600/bg-amber-500 hover:bg-amber-600/g' "$FILE"
sed -i.tmp 's/bg-gradient-to-r from-green-600 to-emerald-600/bg-emerald-500 hover:bg-emerald-600/g' "$FILE"

# Text gradients - Replace with solid colors
sed -i.tmp 's/bg-gradient-to-r from-gray-900 via-blue-800 to-purple-800 bg-clip-text text-transparent/text-slate-900/g' "$FILE"
sed -i.tmp 's/bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent/text-orange-600/g' "$FILE"

# Border colors - Blue to Orange
sed -i.tmp 's/border-blue-200/border-orange-200/g' "$FILE"
sed -i.tmp 's/border-blue-300/border-orange-300/g' "$FILE"
sed -i.tmp 's/border-indigo-200/border-orange-200/g' "$FILE"
sed -i.tmp 's/border-purple-200/border-amber-200/g' "$FILE"

# Hover states - Blue to Orange
sed -i.tmp 's/hover:border-blue-400/hover:border-orange-400/g' "$FILE"
sed -i.tmp 's/hover:border-indigo-400/hover:border-orange-400/g' "$FILE"
sed -i.tmp 's/hover:border-purple-400/hover:border-amber-400/g' "$FILE"

# Background colors - Blue to Orange
sed -i.tmp 's/bg-blue-50/bg-orange-50/g' "$FILE"
sed -i.tmp 's/bg-indigo-50/bg-orange-50/g' "$FILE"
sed -i.tmp 's/bg-purple-50/bg-amber-50/g' "$FILE"

# Text colors - Blue to Orange
sed -i.tmp 's/text-blue-600/text-orange-600/g' "$FILE"
sed -i.tmp 's/text-blue-700/text-orange-700/g' "$FILE"
sed -i.tmp 's/text-indigo-600/text-orange-600/g' "$FILE"
sed -i.tmp 's/text-purple-600/text-amber-600/g' "$FILE"

# Ring colors (focus states) - Blue to Orange
sed -i.tmp 's/ring-blue-500/ring-orange-500/g' "$FILE"
sed -i.tmp 's/ring-indigo-500/ring-orange-500/g' "$FILE"
sed -i.tmp 's/ring-purple-500/ring-amber-500/g' "$FILE"

# Focus states - Blue to Orange
sed -i.tmp 's/focus:border-blue-500/focus:border-orange-500/g' "$FILE"
sed -i.tmp 's/focus:border-indigo-500/focus:border-orange-500/g' "$FILE"

# Clean up
rm -f "${FILE}.tmp"

echo "✅ QuickQuote component updated!"
echo ""
echo "Checking for remaining gradients in QuickQuote..."
GRADIENT_COUNT=$(grep -c "gradient-to-" "$FILE")
echo "Gradients remaining: $GRADIENT_COUNT"

if [ "$GRADIENT_COUNT" -gt "0" ]; then
  echo ""
  echo "Found remaining gradients:"
  grep -n "gradient-to-" "$FILE" | head -10
fi
