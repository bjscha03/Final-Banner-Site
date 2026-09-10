with open('src/pages/Design.tsx', 'r') as f:
    content = f.read()

# Add console.log to handleLetUsDesign
old_handler = '''  const handleLetUsDesign = () => {
    setDesignServiceMode(true);'''

new_handler = '''  const handleLetUsDesign = () => {
    console.log('🔥 handleLetUsDesign called - setting designServiceMode to true');
    setDesignServiceMode(true);
    console.log('🔥 designServiceMode state updated');'''

content = content.replace(old_handler, new_handler)

with open('src/pages/Design.tsx', 'w') as f:
    f.write(content)

print("✅ Debug logging added")
