#!/bin/bash

FILE="src/components/home/QuickQuote.tsx"

# Change harsh orange/green backgrounds to softer tones
# Replace bright orange backgrounds with softer peach/orange tones
sed -i '' 's/bg-orange-500/bg-orange-50/g' "$FILE"
sed -i '' 's/bg-orange-600/bg-orange-100/g' "$FILE"

# Replace bright green backgrounds with softer tones
sed -i '' 's/bg-emerald-500/bg-slate-50/g' "$FILE"
sed -i '' 's/bg-emerald-600/bg-slate-100/g' "$FILE"
sed -i '' 's/bg-green-500/bg-slate-50/g' "$FILE"
sed -i '' 's/bg-green-600/bg-slate-100/g' "$FILE"

# Fix text colors to be darker on light backgrounds
sed -i '' 's/text-white/text-slate-700/g' "$FILE"

# Change border colors to be softer
sed -i '' 's/border-orange-500/border-orange-200/g' "$FILE"
sed -i '' 's/border-orange-600/border-orange-300/g' "$FILE"
sed -i '' 's/border-emerald-500/border-slate-200/g' "$FILE"
sed -i '' 's/border-green-500/border-slate-200/g' "$FILE"

# Fix icon colors
sed -i '' 's/text-orange-500/text-orange-600/g' "$FILE"
sed -i '' 's/text-emerald-500/text-slate-600/g' "$FILE"
sed -i '' 's/text-green-500/text-slate-600/g' "$FILE"

echo "✅ QuickQuote colors softened!"
