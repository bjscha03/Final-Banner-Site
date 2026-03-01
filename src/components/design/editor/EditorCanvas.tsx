import React, { useRef, useEffect, useState } from 'react';
import { Stage, Layer, Rect, Line, Text as KonvaText, Text, Circle, RegularPolygon, Arrow, Transformer, Image as KonvaImage, Group } from 'react-konva';
import useImage from 'use-image';

// Custom hook that preloads image via HTML Image element before passing to Konva
// This ensures CORS and loading work properly on mobile Safari
const usePreloadedImage = (url: string | undefined, crossOrigin?: string) => {
  const [image, setImage] = React.useState<HTMLImageElement | undefined>();
  const [status, setStatus] = React.useState<'loading' | 'loaded' | 'failed'>('loading');

  React.useEffect(() => {
    if (!url) {
      setImage(undefined);
      setStatus('failed');
      return;
    }

    const img = new Image();
    img.crossOrigin = crossOrigin || 'anonymous';
    
    const handleLoad = () => {
      console.log('[PRELOAD] Image loaded successfully:', url.substring(0, 80));
      setImage(img);
      setStatus('loaded');
    };
    
    const handleError = (e: any) => {
      console.error('[PRELOAD] Image failed to load:', url.substring(0, 80), e);
      setStatus('failed');
    };
    
    img.addEventListener('load', handleLoad);
    img.addEventListener('error', handleError);
    
    console.log('[PRELOAD] Starting image load:', url.substring(0, 80));
    img.src = url;
    
    // If image is already cached, it might load synchronously
    if (img.complete) {
      handleLoad();
    }
    
    return () => {
      img.removeEventListener('load', handleLoad);
      img.removeEventListener('error', handleError);
    };
  }, [url, crossOrigin]);

  return [image, status] as const;
};

// Custom hook that preloads image via HTML Image element before passing to Konva
// This ensures CORS and loading work properly on mobile Safari
import { Card } from '@/components/ui/card';
import { Trash2 } from 'lucide-react';
import { useQuoteStore } from '@/store/quote';
import { useEditorStore } from '@/store/editor';
import { grommetPoints, grommetRadius } from '@/lib/preview/grommets';
import Konva from 'konva';

interface EditorCanvasProps {
  selectedObjectId: string | null;
  onSelectObject: (id: string | null) => void;
}

const PIXELS_PER_INCH = 96;

// Image component for rendering uploaded images
const CanvasImage: React.FC<{
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  draggable: boolean;
  onClick: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onTap: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onTransformEnd: (e: Konva.KonvaEventObject<Event>) => void;
  dragBoundFunc?: (pos: { x: number; y: number }) => { x: number; y: number };
  id: string;
}> = ({ url, x, y, width, height, rotation, opacity, draggable, onClick, onTap, onDragEnd, onTransformEnd, dragBoundFunc, id }) => {
  const [image, imageStatus] = usePreloadedImage(url, 'anonymous');
  
  // Trigger re-render when image loads by using useEffect
  React.useEffect(() => {
    if (image) {
      console.log('[IMAGE LOADED]', { 
        id, 
        url: url?.substring(0, 80), 
        urlType: url?.startsWith('blob:') ? 'BLOB' : url?.startsWith('data:') ? 'DATA' : url?.startsWith('http') ? 'HTTP' : 'UNKNOWN',
        imageWidth: image?.width,
        imageHeight: image?.height
      });
      
      // Force layer redraw when image loads
      // This ensures the canvas is updated and thumbnail can be generated
      const node = document.getElementById(id);
      if (node) {
        const stage = (node as any).getStage?.();
        if (stage) {
          const layer = stage.getLayers()[0];
          if (layer) {
            layer.batchDraw();
            console.log('[IMAGE LOADED] Triggered layer redraw');
          }
        }
      }
    }
  }, [image, id, url]);
  
  console.log('[IMAGE RENDER]', { 
    id, 
    url: url?.substring(0, 80), 
    urlType: url?.startsWith('blob:') ? 'BLOB' : url?.startsWith('data:') ? 'DATA' : url?.startsWith('http') ? 'HTTP' : 'UNKNOWN',
    loaded: !!image, 
    imageWidth: image?.width,
    imageHeight: image?.height,
    x, y, width, height 
  });
  
  // Log if image failed to load
  if (!image && url) {
    console.warn('[IMAGE RENDER] Image not loaded yet or failed to load:', url?.substring(0, 80));
  }
  
  return (
    <KonvaImage
      id={id}
      image={image}
      x={x}
      y={y}
      width={width}
      height={height}
      rotation={rotation}
      opacity={opacity}
      draggable={draggable}
      dragBoundFunc={dragBoundFunc}
      onClick={onClick}
      onTap={onTap}
      onDragEnd={onDragEnd}
      onTransformEnd={onTransformEnd}
    />
  );
};


// PDF Placeholder Component (PDFs can't be rendered directly in canvas)
const PDFPlaceholder: React.FC<{
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  draggable: boolean;
  onClick: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onTap: (e: Konva.KonvaEventObject<TouchEvent>) => void;
  onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onTransformEnd: (e: Konva.KonvaEventObject<Event>) => void;
  dragBoundFunc?: (pos: { x: number; y: number }) => { x: number; y: number };
  id: string;
}> = ({ x, y, width, height, rotation, opacity, draggable, onClick, onTap, onDragEnd, onTransformEnd, dragBoundFunc, id }) => {
  console.log('[PDF PLACEHOLDER RENDER]', { id, x, y, width, height, rotation, opacity });
  
  return (
    <Group
      id={id}
      x={x}
      y={y}
      rotation={rotation}
      opacity={opacity}
      draggable={draggable}
      dragBoundFunc={dragBoundFunc}
      onClick={onClick}
      onTap={onTap}
      onDragEnd={onDragEnd}
      onTransformEnd={onTransformEnd}
    >
      {/* Background */}
      <Rect
        width={width}
        height={height}
        fill="#f3f4f6"
        stroke="#d1d5db"
        strokeWidth={2}
      />
      {/* PDF Icon (simple representation) */}
      <Text
        text="PDF"
        fontSize={Math.min(width, height) * 0.2}
        fill="#6b7280"
        width={width}
        height={height}
        align="center"
        verticalAlign="middle"
        fontFamily="Arial"
        fontStyle="bold"
      />
    </Group>
  );
};

const EditorCanvas: React.ForwardRefRenderFunction<{ getStage: () => any }, EditorCanvasProps> = ({ selectedObjectId, onSelectObject }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);

  // Expose getStage method to parent via ref
  React.useImperativeHandle(ref, () => ({
    getStage: () => stageRef.current,
  }));

  const transformerRef = useRef<Konva.Transformer>(null);
  
  const { widthIn, heightIn, grommets } = useQuoteStore();
  const {
    objects,
    selectedIds,
    showBleed,
    showSafeZone,
    showGrommets,
    showGrid,
    gridSize,
    canvasBackgroundColor,
    selectObject,
    clearSelection,
    updateObject,
    deleteSelected,
    duplicateSelected,
    undo,
    redo,
    canUndo,
    canRedo,
    moveSelected,
    getBleedSize,
    getSafeZoneMargin,
  } = useEditorStore();
  
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });
  const [scale, setScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [editingTextValue, setEditingTextValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // State for center snap lines (alignment guides)
  const [snapLines, setSnapLines] = useState<{ horizontal: boolean; vertical: boolean }>({
    horizontal: false,
    vertical: false,
  });
  const SNAP_TOLERANCE = 8; // pixels - distance from center to show snap line
  
  // Ensure textarea focuses on mobile devices
  useEffect(() => {
    if (editingTextId && textareaRef.current) {
      // Small delay to ensure the modal is rendered before focusing
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    }
  }, [editingTextId]);
  
  const bleedSize = getBleedSize();
  const safeZoneMargin = getSafeZoneMargin();
  
  const canvasWidthPx = widthIn * PIXELS_PER_INCH;
  const canvasHeightPx = heightIn * PIXELS_PER_INCH;
  
  // Calculate scale to fit canvas in container
  useEffect(() => {
    const updateSize = () => {
      if (!containerRef.current) return;
      
      const container = containerRef.current;
      const containerWidth = container.clientWidth - 64;
      const containerHeight = container.clientHeight - 64;
      
      const scaleX = containerWidth / canvasWidthPx;
      const scaleY = containerHeight / canvasHeightPx;
      const newScale = Math.min(scaleX, scaleY, 1);
      
      setScale(newScale);
      setStageSize({
        width: container.clientWidth,
        height: container.clientHeight,
      });
      
      setStagePos({
        x: (container.clientWidth - canvasWidthPx * newScale) / 2,
        y: (container.clientHeight - canvasHeightPx * newScale) / 2,
      });
    };
    
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [canvasWidthPx, canvasHeightPx]);
  
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;
      
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelected();
      }
      
      if (cmdOrCtrl && e.key === 'd') {
        e.preventDefault();
        duplicateSelected();
      }
      
      if (cmdOrCtrl && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (canUndo()) undo();
      }
      
      if (cmdOrCtrl && e.shiftKey && e.key === 'z') {
        e.preventDefault();
        if (canRedo()) redo();
      }
      
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const stepInches = step / PIXELS_PER_INCH;
        
        switch (e.key) {
          case 'ArrowUp':
            moveSelected(0, -stepInches);
            break;
          case 'ArrowDown':
            moveSelected(0, stepInches);
            break;
          case 'ArrowLeft':
            moveSelected(-stepInches, 0);
            break;
          case 'ArrowRight':
            moveSelected(stepInches, 0);
            break;
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteSelected, duplicateSelected, undo, redo, canUndo, canRedo, moveSelected]);
  
  // Update transformer when selection changes
  useEffect(() => {
    if (!transformerRef.current || !stageRef.current) return;
    
    const transformer = transformerRef.current;
    const stage = stageRef.current;
    
    if (selectedIds.length === 0) {
      transformer.nodes([]);
    } else {
      const nodes = selectedIds
        .map(id => stage.findOne(`#${id}`))
        .filter(node => node !== null) as Konva.Node[];
      transformer.nodes(nodes);
      
      // Enable aspect ratio locking for images by default
      // Allow free resizing for shapes and text
      const selectedObj = objects.find(obj => obj.id === selectedIds[0]);
      if (selectedObj?.type === 'image') {
        transformer.keepRatio(true);
      } else {
        transformer.keepRatio(false);
      }
    }
    
    const layer = transformer.getLayer();
    if (layer) {
      layer.batchDraw();
    }
  }, [selectedIds, objects]);
  
  const handleStageClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    // Only clear selection if clicking directly on the stage or background
    // Check if the click target is the stage itself or the background rect
    const clickedOnEmpty = e.target === e.target.getStage() || e.target.name() === 'background-rect';

    if (clickedOnEmpty) {
      clearSelection();
    }
  };

  const handleObjectClick = (id: string, e: Konva.KonvaEventObject<MouseEvent>) => {
    // Use Konva's cancelBubble to prevent stage click handler from firing
    // Do NOT use e.evt.stopPropagation() as it breaks Konva's internal drag handling
    e.cancelBubble = true;
    const addToSelection = e.evt?.shiftKey || e.evt?.metaKey || e.evt?.ctrlKey;
    selectObject(id, addToSelection);
  };
  
  // Helper function to constrain object within canvas boundaries
  const constrainToBounds = (x: number, y: number, width: number, height: number) => {
    // Canva-like behavior: Allow images to go off-canvas, but keep at least 10-20% visible
    // This prevents images from being completely lost off-screen
    const MINIMUM_VISIBLE_PERCENT = 0.15; // 15% must remain visible
    
    const minVisibleWidth = width * MINIMUM_VISIBLE_PERCENT;
    const minVisibleHeight = height * MINIMUM_VISIBLE_PERCENT;
    
    // Allow image to extend beyond canvas, but keep minimum visible portion on canvas
    // Image can go left until only minVisibleWidth is showing on the right edge
    const minX = -width + minVisibleWidth;
    // Image can go up until only minVisibleHeight is showing on the bottom edge
    const minY = -height + minVisibleHeight;
    // Image can go right until only minVisibleWidth is showing on the left edge
    const maxX = widthIn - minVisibleWidth;
    // Image can go down until only minVisibleHeight is showing on the top edge
    const maxY = heightIn - minVisibleHeight;
    
    const constrainedX = Math.max(minX, Math.min(maxX, x));
    const constrainedY = Math.max(minY, Math.min(maxY, y));
    
    const isOutOfBounds = x < minX || y < minY || x > maxX || y > maxY;
    
    console.log('[CONSTRAIN] Canva-like bounds:', {
      x, y, width, height,
      minX, minY, maxX, maxY,
      constrainedX, constrainedY,
      isOutOfBounds
    });
    
    return { x: constrainedX, y: constrainedY, isOutOfBounds };
  };
  
  // Create drag bound function for an object to constrain it during dragging
  const createDragBoundFunc = (id: string) => {
    return (pos: { x: number; y: number }) => {
      const obj = objects.find(o => o.id === id);
      if (!obj) return pos;
      
      // Get object dimensions - in SCREEN PIXELS for snap calculations
      let objWidthPx: number;
      let objHeightPx: number;
      
      if (obj.type === 'image' || obj.type === 'shape') {
        // Images and shapes store dimensions in inches
        objWidthPx = (obj as any).width * PIXELS_PER_INCH * scale;
        objHeightPx = (obj as any).height * PIXELS_PER_INCH * scale;
      } else if (obj.type === 'text') {
        // For text, get actual rendered dimensions from the Konva node
        const stage = stageRef.current;
        const node = stage?.findOne('#' + id);
        if (node) {
          // Get actual text dimensions from rendered node
          objWidthPx = node.width() * node.scaleX();
          objHeightPx = node.height() * node.scaleY();
        } else {
          // Fallback: estimate based on fontSize
          const textObj = obj as any;
          const fontSizePx = (textObj.fontSize || 0.5) * PIXELS_PER_INCH * scale;
          const textContent = textObj.content || '';
          objWidthPx = textContent.length * fontSizePx * 0.6;
          objHeightPx = fontSizePx * 1.2;
        }
      } else {
        return pos;
      }
      
      // Convert dimensions back to inches for bounds checking
      const objWidthIn = objWidthPx / (PIXELS_PER_INCH * scale);
      const objHeightIn = objHeightPx / (PIXELS_PER_INCH * scale);
      
      // Convert screen position to inches
      const xInches = (pos.x - stagePos.x) / (PIXELS_PER_INCH * scale);
      const yInches = (pos.y - stagePos.y) / (PIXELS_PER_INCH * scale);
      
      // Calculate object center position in screen pixels
      const objCenterX = pos.x + objWidthPx / 2;
      const objCenterY = pos.y + objHeightPx / 2;
      
      // Canvas center in screen pixels
      const canvasCenterX = stagePos.x + (canvasWidthPx * scale) / 2;
      const canvasCenterY = stagePos.y + (canvasHeightPx * scale) / 2;
      
      // Check if near center and update snap lines
      const nearHorizontalCenter = Math.abs(objCenterY - canvasCenterY) < SNAP_TOLERANCE;
      const nearVerticalCenter = Math.abs(objCenterX - canvasCenterX) < SNAP_TOLERANCE;
      
      // Update snap line visibility
      setSnapLines({ horizontal: nearHorizontalCenter, vertical: nearVerticalCenter });
      
      // Constrain to bounds
      const constrained = constrainToBounds(xInches, yInches, objWidthIn, objHeightIn);
      
      // Convert back to screen coordinates
      let constrainedX = stagePos.x + constrained.x * PIXELS_PER_INCH * scale;
      let constrainedY = stagePos.y + constrained.y * PIXELS_PER_INCH * scale;
      
      // Snap to center if close enough
      if (nearVerticalCenter) {
        constrainedX = canvasCenterX - objWidthPx / 2;
      }
      if (nearHorizontalCenter) {
        constrainedY = canvasCenterY - objHeightPx / 2;
      }
      
      return { x: constrainedX, y: constrainedY };
    };
  };
  
  const handleObjectDragEnd = (id: string, e: Konva.KonvaEventObject<DragEvent>) => {
    const node = e.target;
    
    // Clear snap lines when dragging ends
    setSnapLines({ horizontal: false, vertical: false });
    
    console.log('[DRAG END] ========== START ==========');
    console.log('[DRAG END] Object ID:', id);
    console.log('[DRAG END] Node position (screen px):', { x: node.x(), y: node.y() });
    console.log('[DRAG END] Stage offset:', { x: stagePos.x, y: stagePos.y, scale });
    
    // Account for stage offset and scale
    let newX = (node.x() - stagePos.x) / (PIXELS_PER_INCH * scale);
    let newY = (node.y() - stagePos.y) / (PIXELS_PER_INCH * scale);
    
    console.log('[DRAG END] Calculated position (inches):', { x: newX, y: newY });
    
    // NOTE: We don't need to re-constrain here because dragBoundFunc already
    // constrained the position during dragging. Just save the final position.
    // Re-constraining here can cause snapping issues.
    
    const obj = objects.find(o => o.id === id);
    if (obj) {
      console.log('[DRAG END] Object type:', obj.type);
      if (obj.type === 'shape') {
        console.log('[DRAG END] Shape type:', (obj as any).shapeType);
      }
    }
    
    console.log('[DRAG END] Final position to save (inches):', { x: newX, y: newY });
    console.log('[DRAG END] ========== END ==========');
    updateObject(id, { x: newX, y: newY });
  };
  
  const handleTextDblClick = (id: string, currentText: string) => {
    console.log('📱 Text edit triggered (double-click/tap):', id, currentText);
    setEditingTextId(id);
    setEditingTextValue(currentText);
    selectObject(id);
  };

  const handleObjectTransformEnd = (id: string, e: Konva.KonvaEventObject<Event>) => {
    const node = e.target;
    console.log("[TRANSFORM START] Object:", id);
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    
    // Account for stage offset and scale
    const newX = (node.x() - stagePos.x) / (PIXELS_PER_INCH * scale);
    const newY = (node.y() - stagePos.y) / (PIXELS_PER_INCH * scale);
    
    // Find the object to determine its type
    const obj = objects.find(o => o.id === id);
    
    node.scaleX(1);
    node.scaleY(1);
    
    // Handle text objects differently - scale fontSize instead of width/height
    if (obj?.type === 'text') {
      const currentFontSize = (obj as any).fontSize || 32;
      const newFontSize = currentFontSize * scaleY;
      
      updateObject(id, {
        x: newX,
        y: newY,
        fontSize: newFontSize,
        rotation: node.rotation(),
      });

    } else {
      // For shapes and images, update width/height with boundary constraints
      let newWidth = (node.width() * scaleX) / (PIXELS_PER_INCH * scale);
      let newHeight = (node.height() * scaleY) / (PIXELS_PER_INCH * scale);
      
      // For lines and arrows, preserve the original height (they don't use height for rendering)
      if (obj?.type === 'shape' && ((obj as any).shapeType === 'line' || (obj as any).shapeType === 'arrow')) {
        newHeight = (obj as any).height || 0.1; // Keep original height
      }
      
      // Constrain to canvas bounds
      const constrained = constrainToBounds(newX, newY, newWidth, newHeight);
      
      // If out of bounds, limit the size
      if (constrained.isOutOfBounds) {
        newWidth = Math.min(newWidth, widthIn - constrained.x);
        newHeight = Math.min(newHeight, heightIn - constrained.y);
      }
      
      console.log("[TRANSFORM] Shape - x:", constrained.x, "y:", constrained.y, "width:", newWidth, "height:", newHeight);
      updateObject(id, {
        x: constrained.x,
        y: constrained.y,
        width: newWidth,
        height: newHeight,
        rotation: node.rotation(),
      });
    }
  };
  
  // Calculate grommet positions
  console.log("[GROMMET DEBUG] showGrommets:", showGrommets, "grommets:", grommets, "widthIn:", widthIn, "heightIn:", heightIn);
  const grommetPositions = showGrommets && grommets !== 'none' 
    ? grommetPoints(widthIn, heightIn, grommets)
    : [];
  console.log("[GROMMET DEBUG] grommetPositions count:", grommetPositions.length, grommetPositions);
  
  return (
    <Card ref={containerRef} className="w-full h-full bg-gray-100 overflow-hidden relative">
      <Stage
        ref={stageRef}
        width={stageSize.width}
        height={stageSize.height}
        onClick={handleStageClick}
        onTap={handleStageClick}
      >
        <Layer>
          {/* Background */}
          <Rect
            name="background-rect"
            x={stagePos.x}
            y={stagePos.y}
            width={canvasWidthPx * scale}
            height={canvasHeightPx * scale}
            fill={canvasBackgroundColor || "white"}
            shadowColor="black"
            shadowBlur={10}
            shadowOpacity={0.2}
            shadowOffset={{ x: 0, y: 2 }}
          />
          
          {/* Grid - wrapped in named Group for thumbnail generation */}
          {showGrid && (
            <Group name="grid-guide">
              {Array.from({ length: Math.ceil(widthIn / gridSize) + 1 }).map((_, i) => (
                <Line
                  key={`grid-v-${i}`}
                  points={[
                    stagePos.x + i * gridSize * PIXELS_PER_INCH * scale,
                    stagePos.y,
                    stagePos.x + i * gridSize * PIXELS_PER_INCH * scale,
                    stagePos.y + canvasHeightPx * scale,
                  ]}
                  stroke="#e0e0e0"
                  strokeWidth={1}
                  listening={false}
                />
              ))}
              {Array.from({ length: Math.ceil(heightIn / gridSize) + 1 }).map((_, i) => (
                <Line
                  key={`grid-h-${i}`}
                  points={[
                    stagePos.x,
                    stagePos.y + i * gridSize * PIXELS_PER_INCH * scale,
                    stagePos.x + canvasWidthPx * scale,
                    stagePos.y + i * gridSize * PIXELS_PER_INCH * scale,
                  ]}
                  stroke="#e0e0e0"
                  strokeWidth={1}
                  listening={false}
                />
              ))}
            </Group>
          )}
          
          {/* Bleed area - named for thumbnail generation to hide without React re-render */}
          {showBleed && (
            <Rect
              name="bleed-guide"
              x={stagePos.x}
              y={stagePos.y}
              width={canvasWidthPx * scale}
              height={canvasHeightPx * scale}
              stroke="#ff0000"
              strokeWidth={2}
              dash={[5, 5]}
              listening={false}
            />
          )}
          
          {/* Safe zone - named for thumbnail generation to hide without React re-render */}
          {showSafeZone && (
            <Rect
              name="safezone-guide"
              x={stagePos.x + safeZoneMargin * PIXELS_PER_INCH * scale}
              y={stagePos.y + safeZoneMargin * PIXELS_PER_INCH * scale}
              width={(widthIn - safeZoneMargin * 2) * PIXELS_PER_INCH * scale}
              height={(heightIn - safeZoneMargin * 2) * PIXELS_PER_INCH * scale}
              stroke="#0066ff"
              strokeWidth={2}
              dash={[10, 5]}
              listening={false}
            />
          )}
          
          {/* Center Snap Lines - appear when dragging elements near center */}
          {snapLines.vertical && (
            <Line
              name="snap-line-vertical"
              points={[
                stagePos.x + (canvasWidthPx * scale) / 2,
                stagePos.y,
                stagePos.x + (canvasWidthPx * scale) / 2,
                stagePos.y + canvasHeightPx * scale
              ]}
              stroke="#ff00ff"
              strokeWidth={1}
              dash={[8, 4]}
              listening={false}
            />
          )}
          {snapLines.horizontal && (
            <Line
              name="snap-line-horizontal"
              points={[
                stagePos.x,
                stagePos.y + (canvasHeightPx * scale) / 2,
                stagePos.x + canvasWidthPx * scale,
                stagePos.y + (canvasHeightPx * scale) / 2
              ]}
              stroke="#ff00ff"
              strokeWidth={1}
              dash={[8, 4]}
              listening={false}
            />
          )}
          
          {/* Canvas objects - wrapped in Group with clipping to hide off-canvas parts */}
          <Group
            clipFunc={(ctx) => {
              // Clip to canvas boundaries - anything outside won't be visible
              ctx.rect(
                stagePos.x,
                stagePos.y,
                canvasWidthPx * scale,
                canvasHeightPx * scale
              );
            }}
          >
          {objects
            .filter(obj => obj.visible)
            .sort((a, b) => a.zIndex - b.zIndex)
            .map(obj => {
              if (obj.type === 'image') {
                console.log('[IMAGE OBJECT]', obj);
                console.log('[RENDER] Image position from store:', { x: obj.x, y: obj.y });
                console.log('[RENDER] isPDF flag:', (obj as any).isPDF);
                
                // PDFs are now converted to images, so render them as regular images
                return (
                  <CanvasImage
                    key={obj.id}
                    id={obj.id}
                    url={obj.url}
                    x={stagePos.x + obj.x * PIXELS_PER_INCH * scale}
                    y={stagePos.y + obj.y * PIXELS_PER_INCH * scale}
                    width={obj.width * PIXELS_PER_INCH * scale}
                    height={obj.height * PIXELS_PER_INCH * scale}
                    rotation={obj.rotation}
                    opacity={obj.opacity}
                    draggable={!obj.locked}
                    dragBoundFunc={createDragBoundFunc(obj.id)}
                    onClick={(e) => handleObjectClick(obj.id, e)}
                    onTap={(e) => handleObjectClick(obj.id, e)}
                    onDragEnd={(e) => handleObjectDragEnd(obj.id, e)}
                    onTransformEnd={(e) => handleObjectTransformEnd(obj.id, e)}
                  />
                );
              }
              
              if (obj.type === 'text') {
                return (
                  <KonvaText
                    key={obj.id}
                    id={obj.id}
                    x={stagePos.x + obj.x * PIXELS_PER_INCH * scale}
                    y={stagePos.y + obj.y * PIXELS_PER_INCH * scale}
                    text={editingTextId === obj.id ? editingTextValue : obj.content}
                    fontSize={obj.fontSize * PIXELS_PER_INCH * scale}
                    fontFamily={obj.fontFamily}
                    fill={obj.color}
                    fontStyle={`${obj.fontWeight} ${obj.fontStyle}`}
                    textDecoration={obj.textDecoration}
                    align={obj.textAlign}
                    opacity={obj.opacity}
                    rotation={obj.rotation}
                    draggable={!obj.locked}
                    dragBoundFunc={createDragBoundFunc(obj.id)}
                    onClick={(e) => handleObjectClick(obj.id, e)}
                    onTap={(e) => handleObjectClick(obj.id, e)}
                    onDblClick={() => handleTextDblClick(obj.id, obj.content)}
                    onDblTap={() => handleTextDblClick(obj.id, obj.content)}
                    onDragEnd={(e) => handleObjectDragEnd(obj.id, e)}
                    onTransformEnd={(e) => handleObjectTransformEnd(obj.id, e)}
                  />
                );
              }
              
              if (obj.type === 'shape') {
                const shapeProps = {
                  id: obj.id,
                  x: stagePos.x + obj.x * PIXELS_PER_INCH * scale,
                  y: stagePos.y + obj.y * PIXELS_PER_INCH * scale,
                  width: obj.width * PIXELS_PER_INCH * scale,
                  height: obj.height * PIXELS_PER_INCH * scale,
                  fill: obj.fill,
                  stroke: obj.stroke,
                  strokeWidth: obj.strokeWidth * scale,
                  opacity: obj.opacity,
                  rotation: obj.rotation,
                  draggable: !obj.locked,
                  dragBoundFunc: createDragBoundFunc(obj.id),
                  onClick: (e: Konva.KonvaEventObject<MouseEvent>) => handleObjectClick(obj.id, e),
                  onTap: (e: Konva.KonvaEventObject<MouseEvent>) => handleObjectClick(obj.id, e),
                  onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => handleObjectDragEnd(obj.id, e),
                  onTransformEnd: (e: Konva.KonvaEventObject<Event>) => handleObjectTransformEnd(obj.id, e),
                };
                
                if (obj.shapeType === 'rect') {
                  return <Rect key={obj.id} {...shapeProps} cornerRadius={obj.cornerRadius ? obj.cornerRadius * scale : 0} />;
                } else if (obj.shapeType === 'circle') {
                  // Use offsetX/offsetY to make circle position from top-left like rectangles
                  const radius = (obj.width * PIXELS_PER_INCH * scale) / 2;
                  return <Circle 
                    key={obj.id} 
                    {...shapeProps} 
                    radius={radius}
                    offsetX={-radius}
                    offsetY={-radius}
                  />;
                } else if (obj.shapeType === 'triangle') {
                  // Use offsetX/offsetY to make triangle position from top-left like rectangles
                  const radius = (obj.width * PIXELS_PER_INCH * scale) / 2;
                  return <RegularPolygon 
                    key={obj.id} 
                    {...shapeProps} 
                    sides={3} 
                    radius={radius}
                    offsetX={-radius}
                    offsetY={-radius}
                  />;
                } else if (obj.shapeType === 'line') {
                  return (
                    <Line
                      key={obj.id}
                      {...shapeProps}
                      points={[0, 0, obj.width * PIXELS_PER_INCH * scale, 0]}
                      hitStrokeWidth={20}
                    />
                  );
                } else if (obj.shapeType === 'arrow') {
                  return (
                    <Arrow
                      key={obj.id}
                      {...shapeProps}
                      points={[0, 0, obj.width * PIXELS_PER_INCH * scale, 0]}
                      pointerLength={10 * scale}
                      pointerWidth={10 * scale}
                      hitStrokeWidth={20}
                    />
                  );
                }
              }
              
              return null;
            })}
          
          </Group>

          {/* Grommets - wrapped in named Group for thumbnail generation to hide without React re-render */}
          <Group name="grommet-guide">
            {grommetPositions.map((pos, idx) => (
              <Circle
                key={`grommet-${idx}`}
                x={stagePos.x + pos.x * PIXELS_PER_INCH * scale}
                y={stagePos.y + pos.y * PIXELS_PER_INCH * scale}
                radius={Math.max(grommetRadius(widthIn, heightIn) * PIXELS_PER_INCH * scale, 4)}
                fill="#666"
                stroke="#333"
                strokeWidth={Math.max(1 * scale, 1.5)}
                listening={false}
              />
            ))}
          </Group>
          {/* Transformer */}
          <Transformer
            ref={transformerRef}
            keepRatio={true}  // Lock aspect ratio by default for images
            enabledAnchors={[
              'top-left',
              'top-right',
              'bottom-left',
              'bottom-right',
              'top-center',
              'middle-left',
              'middle-right',
              'bottom-center',
            ]}
            rotateEnabled={true}
            borderStroke="#18448D"
            borderStrokeWidth={2}
            anchorFill="#18448D"
            anchorStroke="#ffffff"
            anchorStrokeWidth={2}
            anchorSize={10}
            anchorCornerRadius={2}
            boundBoxFunc={(oldBox, newBox) => {
              // Remove minimum size constraint to prevent snapping
              // Allow any size for smooth resizing
              if (newBox.width < 1 || newBox.height < 1) {
                return oldBox;
              }
              return newBox;
            }}
          />
        </Layer>
      </Stage>
      

      {/* ADDED: Ruler overlays with inch markings (hidden on mobile) */}
      {/* Top ruler - adaptive label step for readability on large banners */}
      {(() => {
        const pxPerInch = PIXELS_PER_INCH * scale;
        const labelStep = pxPerInch >= 28 ? 1 : pxPerInch >= 14 ? 2 : pxPerInch >= 8 ? 5 : pxPerInch >= 4 ? 12 : 24;
        return (
      <div
        className="absolute pointer-events-none hidden sm:block"
        style={{
          left: stagePos.x,
          top: Math.max(stagePos.y - 22, 0),
          width: canvasWidthPx * scale,
          height: 22,
          overflow: "hidden",
        }}
      >
        <div className="w-full h-full bg-gray-200/90 border-b border-gray-400 flex items-end relative">
          {Array.from({ length: Math.ceil(widthIn) + 1 }).map((_, i) => {
            const showLabel = i % labelStep === 0;
            return (
            <React.Fragment key={`ruler-top-${i}`}>
              <div className="absolute bottom-0" style={{ left: i * pxPerInch }}>
                <div className={`w-px ${showLabel ? "h-3" : "h-2"} bg-gray-600`} />
                {showLabel && (
                  <span className="absolute text-[10px] font-medium text-gray-700 select-none" style={{ left: 2, bottom: 5 }}>{i}"</span>
                )}
              </div>
              {i < widthIn && pxPerInch >= 6 && (
                <div className="absolute bottom-0 w-px h-1.5 bg-gray-400" style={{ left: (i + 0.5) * pxPerInch }} />
              )}
            </React.Fragment>
            );
          })}
        </div>
      </div>
        );
      })()}

      {/* Left ruler - adaptive label step for readability on large banners */}
      {(() => {
        const pxPerInch = PIXELS_PER_INCH * scale;
        const labelStep = pxPerInch >= 28 ? 1 : pxPerInch >= 14 ? 2 : pxPerInch >= 8 ? 5 : pxPerInch >= 4 ? 12 : 24;
        return (
      <div
        className="absolute pointer-events-none hidden sm:block"
        style={{
          left: Math.max(stagePos.x - 22, 0),
          top: stagePos.y,
          width: 22,
          height: canvasHeightPx * scale,
          overflow: "hidden",
        }}
      >
        <div className="w-full h-full bg-gray-200/90 border-r border-gray-400 relative">
          {Array.from({ length: Math.ceil(heightIn) + 1 }).map((_, i) => {
            const showLabel = i % labelStep === 0;
            return (
            <React.Fragment key={`ruler-left-${i}`}>
              <div className="absolute right-0" style={{ top: i * pxPerInch }}>
                <div className={`h-px ${showLabel ? "w-3" : "w-2"} bg-gray-600`} />
                {showLabel && (
                  <span className="absolute text-[10px] font-medium text-gray-700 select-none" style={{ right: 5, top: 2, writingMode: "vertical-lr" as any }}>{i}"</span>
                )}
              </div>
              {i < heightIn && pxPerInch >= 6 && (
                <div className="absolute right-0 h-px w-1.5 bg-gray-400" style={{ top: (i + 0.5) * pxPerInch }} />
              )}
            </React.Fragment>
            );
          })}
        </div>
      </div>
        );
      })()}
      {/* Text Editing Input - Shows when double-clicking text */}
      {editingTextId && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold mb-4">Edit Text</h3>
            <textarea
              ref={textareaRef}
              autoFocus
              value={editingTextValue}
              onChange={(e) => setEditingTextValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  // Save the text
                  updateObject(editingTextId, { content: editingTextValue });
                  setEditingTextId(null);
                  setEditingTextValue('');
                } else if (e.key === 'Escape') {
                  // Cancel editing
                  setEditingTextId(null);
                  setEditingTextValue('');
                }
              }}
              className="w-full border border-gray-300 rounded-lg p-3 min-h-[100px] focus:outline-none focus:ring-2 focus:ring-[#18448D]"
              placeholder="Enter your text..."
            />
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => {
                  updateObject(editingTextId, { content: editingTextValue });
                  setEditingTextId(null);
                  setEditingTextValue('');
                }}
                className="flex-1 bg-[#18448D] hover:bg-[#153a7a] text-white px-4 py-2 rounded-lg font-medium transition-colors"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setEditingTextId(null);
                  setEditingTextValue('');
                }}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-3">
              Press <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded">Enter</kbd> to save, <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded">Shift+Enter</kbd> for new line, <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded">Esc</kbd> to cancel
            </p>
          </div>
        </div>
      )}

      {/* Mobile Delete Button - Shows when object is selected */}
      {selectedIds.length > 0 && (
        <div className="lg:hidden absolute top-4 right-4 flex gap-2">
          <button
            onClick={() => {
              deleteSelected();
              clearSelection();
            }}
            className="bg-red-500 hover:bg-red-600 text-white p-3 rounded-full shadow-lg transition-all duration-200 active:scale-95"
            aria-label="Delete selected object"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      )}
      
      {/* Dimension label */}
      <div className="absolute bottom-4 right-4 bg-white px-3 py-2 rounded shadow text-sm font-medium text-gray-700">
        {widthIn}" × {heightIn}"
      </div>
    </Card>
  );
};

export default React.forwardRef(EditorCanvas);
