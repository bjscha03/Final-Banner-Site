#!/bin/bash
FILE="src/components/design/BannerEditorLayout.tsx"

# Change 1: Add two lines after line 49 (after "onOpenAIModal?: () => void;")
sed -i '' '49 a\
  designServiceMode?: boolean;\
  onDesignServiceModeChange?: (mode: boolean) => void;
' "$FILE"

# Change 2: Replace line 54 (the component signature line) - now it's line 56 after adding 2 lines
sed -i '' '56 s/const BannerEditorLayout: React.FC<BannerEditorLayoutProps> = ({ onOpenAIModal }) => {/const BannerEditorLayout: React.FC<BannerEditorLayoutProps> = ({ onOpenAIModal, designServiceMode: externalDesignServiceMode, onDesignServiceModeChange }) => {/' "$FILE"

# Change 3: Replace lines 67-68 (state management) - now lines 69-70 after adding 2 lines
sed -i '' '69,70 c\
  // Design Service mode state - use external state if provided, otherwise use internal state\
  const [internalDesignServiceMode, setInternalDesignServiceMode] = useState(false);\
  const designServiceMode = externalDesignServiceMode !== undefined ? externalDesignServiceMode : internalDesignServiceMode;\
  const setDesignServiceMode = onDesignServiceModeChange || setInternalDesignServiceMode;
' "$FILE"

echo "✅ Changes applied"
