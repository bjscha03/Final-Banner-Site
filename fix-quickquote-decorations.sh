#!/bin/bash

FILE="src/components/home/QuickQuote.tsx"

# Create a temporary file
TMP_FILE="${FILE}.tmp"

# Remove decorative background elements sections
awk '
/Decorative background elements/ {
    skip = 1
}
skip && /<\/div>/ {
    skip = 0
    next
}
!skip
' "$FILE" > "$TMP_FILE"

# Move temp file back
mv "$TMP_FILE" "$FILE"

echo "✅ Removed decorative elements from QuickQuote!"
