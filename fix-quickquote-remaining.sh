#!/bin/bash
# Fix all remaining gradients in QuickQuote

FILE="src/components/home/QuickQuote.tsx"

echo "�� Fixing remaining QuickQuote gradients..."

# Decorative background gradients
sed -i.tmp 's/bg-gradient-to-r from-blue-500\/10 via-indigo-500\/15 to-purple-500\/10/bg-orange-500\/10/g' "$FILE"
sed -i.tmp 's/bg-gradient-to-br from-blue-500\/20 to-transparent/bg-orange-500\/15/g' "$FILE"
sed -i.tmp 's/bg-gradient-to-tl from-indigo-500\/20 to-transparent/bg-orange-500\/15/g' "$FILE"
sed -i.tmp 's/bg-gradient-to-bl from-blue-300\/20 to-transparent/bg-orange-300\/20/g' "$FILE"
sed -i.tmp 's/bg-gradient-to-tr from-indigo-300\/20 to-transparent/bg-orange-300\/20/g' "$FILE"

# Heading gradients
sed -i.tmp 's/bg-gradient-to-r from-slate-900 via-blue-800 to-indigo-900 bg-clip-text text-transparent/text-slate-900/g' "$FILE"
sed -i.tmp 's/bg-gradient-to-r from-gray-900 via-blue-800 to-indigo-800 bg-clip-text text-transparent/text-slate-900/g' "$FILE"

# Card header backgrounds
sed -i.tmp 's/bg-gradient-to-r from-blue-600\/5 via-indigo-600\/5 to-purple-600\/5/bg-orange-50/g' "$FILE"

# Icon backgrounds
sed -i.tmp 's/bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600/bg-orange-500/g' "$FILE"
sed -i.tmp 's/bg-gradient-to-r from-orange-400 to-red-500/bg-orange-500/g' "$FILE"

# Any remaining blue/indigo/purple gradient patterns
sed -i.tmp 's/from-blue-/from-orange-/g' "$FILE"
sed -i.tmp 's/to-blue-/to-orange-/g' "$FILE"
sed -i.tmp 's/via-blue-/via-orange-/g' "$FILE"
sed -i.tmp 's/from-indigo-/from-orange-/g' "$FILE"
sed -i.tmp 's/to-indigo-/to-orange-/g' "$FILE"
sed -i.tmp 's/via-indigo-/via-orange-/g' "$FILE"
sed -i.tmp 's/from-purple-/from-amber-/g' "$FILE"
sed -i.tmp 's/to-purple-/to-amber-/g' "$FILE"
sed -i.tmp 's/via-purple-/via-amber-/g' "$FILE"

# Clean up
rm -f "${FILE}.tmp"

echo "✅ Additional fixes applied!"
echo ""
echo "Checking again..."
GRADIENT_COUNT=$(grep -c "gradient-to-" "$FILE")
echo "Gradients remaining: $GRADIENT_COUNT"

if [ "$GRADIENT_COUNT" -gt "0" ]; then
  echo ""
  echo "Remaining gradients (showing first 5):"
  grep -n "gradient-to-" "$FILE" | head -5
fi
