#!/usr/bin/env python3

file_path = 'src/components/design/BannerEditorLayout.tsx'

# Read the file
with open(file_path, 'r') as f:
    content = f.read()

# Change 1: Update interface
old_interface = '''interface BannerEditorLayoutProps {
  onOpenAIModal?: () => void;
}'''

new_interface = '''interface BannerEditorLayoutProps {
  onOpenAIModal?: () => void;
  designServiceMode?: boolean;
  onDesignServiceModeChange?: (mode: boolean) => void;
}'''

content = content.replace(old_interface, new_interface)

# Change 2: Update component signature
old_sig = 'const BannerEditorLayout: React.FC<BannerEditorLayoutProps> = ({ onOpenAIModal }) => {'

new_sig = '''const BannerEditorLayout: React.FC<BannerEditorLayoutProps> = ({ 
  onOpenAIModal,
  designServiceMode: externalDesignServiceMode,
  onDesignServiceModeChange
}) => {'''

content = content.replace(old_sig, new_sig)

# Change 3: Update state management
old_state = '''  // Design Service mode state
  const [designServiceMode, setDe  const [designServiceMode, salse);'''

new_state = '''  // Design Service mode state - use external state if provided, otherwise use internal state
  const [inter  const [inter  const setInternalDesignServiceMode] =  const [inter  const [inter  const setInternalDeernalD  const [inter  const [intered ? externalDesignServiceMode : internalDesignServiceMode;
  c  c  c  c  c  c  c  c  c  c onDesignServiceModeChange || setInternalDesignServiceMode;'''

content = content.replace(old_state, new_state)

# Write the file
with open(file_path, 'w') as f:
    f.write(content)

print("✅ All 3 changes made successfully!")
