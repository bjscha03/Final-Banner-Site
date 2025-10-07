#!/bin/bash
# Final cleanup - remove orange-to-orange gradients and remaining issues

FILE="src/components/home/QuickQuote.tsx"

echo "🧹 Final QuickQuote cleanup..."

# Replace orange-to-orange gradients with solid
sed -i.tmp 's/bg-gradient-to-br from-orange-50 to-orange-50/bg-orange-50/g' "$FILE"
sed -i.tmp 's/hover:from-orange-100 hover:to-orange-100/hover:bg-orange-100/g' "$FILE"
sed -i.tmp 's/bg-gradient-to-br from-white to-orange-50\/30/bg-white/g' "$FILE"

# Fix any remaining gradient-to patterns
sed -i.tmp 's/bg-gradient-to-br from-orange-/bg-orange-/g' "$FILE"
sed -i.tmp 's/bg-gradient-to-r from-orange-/bg-orange-/g' "$FILE"
sed -i.tmp 's/bg-gradient-to-tl from-orange-/bg-orange-/g' "$FILE"
sed -i.tmp 's/bg-gradient-to-bl from-orange-/bg-orange-/g' "$FILE"
sed -i.tmp 's/bg-gradient-to-tr from-orange-/bg-orange-/g' "$FILE"

# Clean up
rm -f "${FILE}.tmp"

echo "✅ Final cleanup complete!"
echo ""
GRADIENT_COUNT=$(grep -c "gradient-to-" "$FILE")
echo "Total gradients remaining: $GRADIENT_COUNT"

if [ "$GRADIENT_COUNT" -eq "0" ]; then
  echo "🎉 All gradients removed from QuickQuote!"
else
  echo ""
  echo "Note: Some gradients may remain for specific styling purposes"
  echo "Showing remaining (first 3):"
  grep -n "gradient-to-" "$FILE" | head -3
fi
