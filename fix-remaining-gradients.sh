#!/bin/bash
# Fix remaining gradients in updated components

echo "🔧 Fixing remaining gradients..."

# CompanySpotlight.tsx
sed -i.tmp 's/bg-gradient-to-br from-blue-200\/40 to-transparent/bg-orange-200\/30/g' src/components/CompanySpotlight.tsx
sed -i.tmp 's/bg-gradient-to-tl from-indigo-200\/40 to-transparent/bg-amber-200\/30/g' src/components/CompanySpotlight.tsx
sed -i.tmp 's/bg-gradient-to-t from-black\/20 to-transparent/bg-slate-900\/10/g' src/components/CompanySpotlight.tsx
sed -i.tmp 's/bg-gradient-to-br from-white to-gray-50/bg-white/g' src/components/CompanySpotlight.tsx

# TestimonialsSection.tsx
sed -i.tmp 's/bg-gradient-to-br from-blue-200\/30 to-transparent/bg-orange-200\/30/g' src/components/TestimonialsSection.tsx
sed -i.tmp 's/bg-gradient-to-tl from-indigo-200\/30 to-transparent/bg-amber-200\/30/g' src/components/TestimonialsSection.tsx
sed -i.tmp 's/bg-gradient-to-r from-blue-600 to-blue-800 bg-clip-text text-transparent/text-orange-600/g' src/components/TestimonialsSection.tsx
sed -i.tmp 's/bg-gradient-to-r from-gray-900 to-blue-800 bg-clip-text text-transparent/text-slate-900/g' src/components/TestimonialsSection.tsx

# WhyChooseUs.tsx
sed -i.tmp 's/bg-gradient-to-br from-blue-300\/30 to-transparent/bg-orange-200\/30/g' src/components/WhyChooseUs.tsx
sed -i.tmp 's/bg-gradient-to-tl from-purple-300\/30 to-transparent/bg-amber-200\/30/g' src/components/WhyChooseUs.tsx
sed -i.tmp 's/bg-gradient-to-r from-indigo-300\/20 to-transparent/bg-orange-300\/20/g' src/components/WhyChooseUs.tsx
sed -i.tmp 's/bg-gradient-to-r from-gray-900 via-blue-800 to-purple-800 bg-clip-text text-transparent/text-slate-900/g' src/components/WhyChooseUs.tsx
sed -i.tmp 's/bg-gradient-to-br from-orange-100 to-orange-200/bg-orange-100/g' src/components/WhyChooseUs.tsx
sed -i.tmp 's/group-hover:from-orange-200 group-hover:to-orange-300/group-hover:bg-orange-200/g' src/components/WhyChooseUs.tsx
sed -i.tmp 's/bg-gradient-to-r from-gray-900 to-orange-800 bg-clip-text text-transparent/text-slate-900/g' src/components/WhyChooseUs.tsx
sed -i.tmp 's/bg-gradient-to-br from-white via-gray-50 to-gray-100/bg-white/g' src/components/WhyChooseUs.tsx
sed -i.tmp 's/bg-gradient-to-t from-black\/5 via-transparent to-transparent/bg-transparent/g' src/components/WhyChooseUs.tsx
sed -i.tmp 's/bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50/bg-orange-50/g' src/components/WhyChooseUs.tsx
sed -i.tmp 's/border-blue-100\/50/border-orange-200/g' src/components/WhyChooseUs.tsx
sed -i.tmp 's/bg-gradient-to-r from-blue-500 to-indigo-500/bg-orange-500/g' src/components/WhyChooseUs.tsx

# Clean up
rm -f src/components/*.tmp

echo "✅ All remaining gradients fixed!"
