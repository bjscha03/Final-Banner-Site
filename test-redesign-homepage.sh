#!/bin/bash
# Quick test script - Apply redesign to homepage components only

echo "========================================="
echo "TESTING HOMEPAGE REDESIGN"
echo "Applying orange branding to home page"
echo "========================================="
echo ""

# Create backup
BACKUP_DIR="test-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

echo "📦 Creating backup..."
cp src/components/HeroSection.tsx "$BACKUP_DIR/"
cp src/components/CompanySpotlight.tsx "$BACKUP_DIR/"
cp src/components/TestimonialsSection.tsx "$BACKUP_DIR/"
cp src/components/WhyChooseUs.tsx "$BACKUP_DIR/"
echo "✅ Backup created in $BACKUP_DIR"
echo ""

echo "🎨 Applying redesigned components..."

# Apply HeroSection
if [ -f "src/components/HeroSection_REDESIGNED.tsx" ]; then
  cp src/components/HeroSection_REDESIGNED.tsx src/components/HeroSection.tsx
  echo "✅ HeroSection.tsx updated"
else
  echo "⚠️  HeroSection_REDESIGNED.tsx not found"
fi

# For other components, apply sed transformations
echo "🔧 Applying transformations to other components..."

for file in src/components/CompanySpotlight.tsx src/components/TestimonialsSection.tsx src/components/WhyChooseUs.tsx; do
  if [ -f "$file" ]; then
    # Background gradients
    sed -i.tmp 's/bg-gradient-to-br from-gray-50 via-blue-50\/30 to-white/bg-slate-50/g' "$file"
    sed -i.tmp 's/bg-gradient-to-br from-blue-50 via-indigo-50\/50 to-purple-50\/30/bg-slate-50/g' "$file"
    sed -i.tmp 's/bg-gradient-to-br from-white via-gray-50\/50 to-blue-50\/30/bg-white/g' "$file"
    
    # Button/badge gradients
    sed -i.tmp 's/bg-gradient-to-r from-blue-600 to-indigo-600/bg-orange-500 hover:bg-orange-600/g' "$file"
    sed -i.tmp 's/bg-gradient-to-r from-orange-500 to-red-600/bg-orange-500 hover:bg-orange-600/g' "$file"
    
    # Text gradients
    sed -i.tmp 's/bg-gradient-to-r from-gray-900 via-blue-800 to-indigo-900 bg-clip-text text-transparent/text-slate-900/g' "$file"
    sed -i.tmp 's/bg-gradient-to-r from-gray-900 via-blue-800 to-indigo-800 bg-clip-text text-transparent/text-slate-900/g' "$file"
    
    # Card backgrounds
    sed -i.tmp 's/bg-gradient-to-r from-blue-50 to-indigo-50/bg-orange-50/g' "$file"
    sed -i.tmp 's/bg-gradient-to-r from-blue-50 via-indigo-50 to-blue-50/bg-orange-50/g' "$file"
    
    # Text colors
    sed -i.tmp 's/text-blue-600/text-orange-600/g' "$file"
    sed -i.tmp 's/text-blue-800/text-orange-600/g' "$file"
    
    # Border colors
    sed -i.tmp 's/border-blue-600/border-orange-500/g' "$file"
    sed -i.tmp 's/border-l-4 border-blue-600/border-l-4 border-orange-500/g' "$file"
    
    # Decorative blurs
    sed -i.tmp 's/bg-blue-300\/20/bg-orange-200\/30/g' "$file"
    sed -i.tmp 's/bg-indigo-300\/20/bg-orange-300\/20/g' "$file"
    
    rm -f "${file}.tmp"
    echo "✅ $(basename $file) updated"
  fi
done

echo ""
echo "========================================="
echo "✅ Homepage Redesign Applied!"
echo "========================================="
echo ""
echo "🧪 Next steps:"
echo "1. Run: npm run dev"
echo "2. Open: http://localhost:5173"
echo "3. Check the homepage for:"
echo "   • Orange branding"
echo "   • No blue/purple gradients"
echo "   • Clean, professional look"
echo ""
echo "💾 To restore backup:"
echo "   cp $BACKUP_DIR/* src/components/"
echo ""
