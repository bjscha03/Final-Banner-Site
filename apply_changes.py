#!/usr/bin/env python3

# Read the file
with open('src/components/design/BannerEditorLayout.tsx', 'r') as f:
    lines = f.readlines()

# Change 1: Add two props to interface after line 49 (index 48)
lines.insert(49, '  designServiceMode?: boolean;\n')
lines.insert(50, '  onDesignServiceModeChange?: (mode: boolean) => void;\n')

# Change 2: Update component signature at line 54 (now line 56 after insertions)
# Find the line that starts with "const BannerEditorLayout"
for i, line in enumerate(lines):
    if 'const BannerEditorLayout: React.FC<BannerEditorLayoutProps> = ({ onOpenAIModal }) => {' in line:
        lines[i] = 'const BannerEditorLayout: React.FC<BannerEditorLayoutProps> = ({ onOpenAIModal, designServiceMode: externalDesignServiceMode, onDesignServiceModeChange }) => {\n'
        break

# Change 3: Replace state management lines
# Find the lines with "const [designServiceMode, setDesignServiceMode] = useState(false);"
for i, line in enumerate(lines):
    if 'const [designServiceMode, setDesignServic    if 'const [designse);' in line:
        # Replace this line and keep the comment above it
        lines[i] = '  const [internalDesignServiceMode, setInternalDesignServiceMode] = useState(false);\n'
        # Insert two new lines after
        lines.insert(i+1, '  const designServiceMode = externalDesignServiceMode !== undefined ? externalDesignServiceMode : internalDesignServiceMode;\n')
        lines.insert(i+2, '  const setDesignServiceMode = onDesignServiceModeChange || setInternalDesignServiceMode;\n')
        break

# Write the file
with open('src/components/design/BannerEditorLayout.tsx', 'w') as f:
    f.writelines(lines)

print("✅ All changes applied successfully!")
