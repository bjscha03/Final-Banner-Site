#!/bin/bash

FILE="src/components/home/QuickQuote.tsx"

# Replace harsh orange-50 section headers with white backgrounds
sed -i '' 's/bg-orange-50 px-6 py-5 border-b border-orange-200\/30/bg-white px-6 py-5 border-b border-slate-200/g' "$FILE"

# Replace orange-50 icon backgrounds with white
sed -i '' 's/bg-orange-50 rounded-lg flex items-center justify-center/bg-white border border-orange-200 rounded-lg flex items-center justify-center/g' "$FILE"
sed -i '' 's/bg-orange-50 rounded-xl flex items-center justify-center/bg-white border border-orange-200 rounded-xl flex items-center justify-center/g' "$FILE"

# Replace orange-50 pulse dots with orange-500
sed -i '' 's/bg-orange-50 rounded-full shadow-sm animate-pulse/bg-orange-500 rounded-full shadow-sm animate-pulse/g' "$FILE"

# Fix the total area display background
sed -i '' 's/bg-orange-50\/50 via-orange-50\/30 to-orange-50\/20 border border-orange-200\/40/bg-slate-50 border border-slate-200/g' "$FILE"
sed -i '' 's/bg-orange-50\/5 to-orange-500\/5/bg-slate-100\/50/g' "$FILE"

# Fix quantity section header
sed -i '' 's/bg-orange-50 px-6 py-5 border border-orange-200\/30/bg-white px-6 py-5 border-b border-slate-200/g' "$FILE"

# Fix the "Popular" badge
sed -i '' 's/bg-orange-50 via-red-500 to-pink-500 text-slate-700/bg-orange-500 text-white/g' "$FILE"

# Fix the instant quote section icon backgrounds  
sed -i '' 's/bg-orange-50 rounded-lg flex items-center justify-center shadow-sm/bg-white border border-orange-200 rounded-lg flex items-center justify-center shadow-sm/g' "$FILE"

echo "✅ QuickQuote comprehensive color fix applied!"
