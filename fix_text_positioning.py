#!/usr/bin/env python3
"""Fix text positioning to make thumbnails match live preview."""

def fix_draggable_text():
    with open('src/components/design/DraggableText.tsx', 'r') as f:
        content = f.read()
    
    if 'adjustedLeftPercent' in content:
        print("⚠️  Already fixed")
        return False
    
    marker = "const fontSize = element.fontSize * (previewScale / 100);"
    parts = content.split(marker, 1)
    
    new_code = """const fontSize = element.fontSize * (previewScale / 100);
  
  const [adjustedLeftPercent, setAdjustedLeftPercent] = useState(leftPercent);
  const [adjustedTopPercent, setAdjustedTopPercent] = useState(topPercent);
  
  useEffect(() => {
    if (!textRef.current) return;
    const container = textRef.current.parentElement;
    if (!container) return;
    
    const svgElement = container.querySelector('svg');
    if (!svgElement) {
      setAdjustedLeftPercent(leftPercent);
      setAdjustedTopPercent(topPercent);
      return;
    }
    
    const svgRect = svgElement.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    
    const svgLeftOffset = svgRect.left - containerRect.left;
    const svgTopOffset = svgRect.top - containerRect.top;
    
    const leftPx = svgLeftOffset + (leftPercent / 100) * svgRect.width;
    const topPx = svgTopOffset + (topPercent / 100) * svgRect.height;
    
    const newLeftPercent = (leftPx / containerRect.width) * 100;
    const newTopPercent = (topPx / containerRect.height) * 100;
    
    setAdjustedLeftPercent(newLeftPercent);
    setAdjustedTopPercent(newTopPercent);
  }, [leftPercent, topPercent, previewScale]);"""
    
    content = parts[0] + new_code + parts[1]
    content = content.replace("left: `${leftPercent}%`,", "left: `${adjustedLeftPercent}%`,")
    content = content.replace("top: `${topPercent}%`,", "top: `${adjustedTopPercent}%`,")
    
    with open('src/components/design/DraggableText.tsx', 'w') as f:
        f.write(content)
    
    print("✅ Fixed DraggableText")
    return True

if __name__ == '__main__':
    fix_draggable_text()
