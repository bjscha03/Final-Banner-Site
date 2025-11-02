#!/bin/bash

# Cart Health Check Script
# Run this to verify critical cart functionality is intact

set -e

echo "🏥 CART HEALTH CHECK"
echo "===================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ERRORS=0
WARNINGS=0

# Check 1: Cookie name consistency
echo "📋 Check 1: Cookie name consistency..."
COOKIE_NAME_IN_SYNC=$(grep -c "cart_session_id" src/lib/cartSync.ts || true)
COOKIE_NAME_IN_HOOK=$(grep -c "cart_session_id" src/hooks/useCartSync.ts || true)

if [ "$COOKIE_NAME_IN_SYNC" -gt 0 ] && [ "$COOKIE_NAME_IN_HOOK" -gt 0 ]; then
    echo -e "${GREEN}✅ Cookie name 'cart_session_id' found in both files${NC}"
else
    echo -e "${RED}❌ Cookie name mismatch detected!${NC}"
    ERRORS=$((ERRORS + 1))
fi

# Check for wrong cookie name
WRONG_COOKIE=$(grep -c "guest_session_id" src/hooks/useCartSync.ts src/lib/cartSync.ts 2>/dev/null || true)
if [ "$WRONG_COOKIE" -gt 0 ]; then
    echo -e "${RED}❌ CRITICAL: Found 'guest_session_id' (should be 'cart_session_id')${NC}"
    ERRORS=$((ERRORS + 1))
fi

echo ""

# Check 2: Merge function exists
echo "📋 Check 2: Merge function exists..."
if grep -q "mergeGuestCartOnLogin" src/lib/cartSync.ts; then
    echo -e "${GREEN}✅ mergeGuestCartOnLogin function exists${NC}"
else
    echo -e "${RED}❌ mergeGuestCartOnLogin function missing!${NC}"
    ERRORS=$((ERRORS + 1))
fi

echo ""

# Check 3: TypeScript compilation
echo "📋 Check 3: TypeScript compilation..."
if npx tsc --noEmit 2>&1 | grep -q "error"; then
    echo -e "${RED}❌ TypeScript compilation errors detected!${NC}"
    ERRORS=$((ERRORS + 1))
else
    echo -e "${GREEN}✅ TypeScript compiles without errors${NC}"
fi

echo ""
echo "===================="
echo "📊 HEALTH CHECK SUMMARY"
echo "===================="

if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}✅ ALL CHECKS PASSED!${NC}"
    echo "Cart functionality is healthy. Safe to deploy."
    exit 0
else
    echo -e "${RED}❌ $ERRORS ERROR(S)${NC}"
    echo "CRITICAL ISSUES DETECTED! DO NOT DEPLOY."
    exit 1
fi
