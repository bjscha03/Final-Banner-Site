import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Stage, Layer, Rect, Line, Text, Image as KonvaImage, Circle, Group } from 'react-konva';
import { Transformer } from 'react-konva';
import Konva from 'konva';
import { inToPx, pxToIn, calculateEffectiveDPI, computeGrommetPositions } from '../utils/units';
import Spinner from './Spinner';

export interface ExportState {
  stageZoom: number;
  image: {
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
    widthPx: number;
    heightPx: number;
  };
}

export interface BannerDesignerProps {
  widthIn?: number;
  heightIn?: number;
  dpi?: number;
  bleedIn?: number;
  safeMarginIn?: number;
  grommetEveryIn?: number;
  cornerGrommetOffsetIn?: number;
  onChange?: (state: ExportState) => void;
}

const BannerDesigner: React.FC<BannerDesignerProps> = ({
  widthIn = 48,
  heightIn = 24,
  dpi = 96,
  bleedIn = 0.25,
  safeMarginIn = 0.5,
  grommetEveryIn = 24,
  cornerGrommetOffsetIn = 1,
  onChange
}) => {
  const [loading, setLoading] = useState(false);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageNode, setImageNode] = useState<Konva.Image | null>(null);
  const [stageScale, setStageScale] = useState(1);
  const [showLowDPIWarning, setShowLowDPIWarning] = useState(false);
  
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Calculate dimensions
  const bannerPxW = inToPx(widthIn, dpi);
  const bannerPxH = inToPx(heightIn, dpi);
  const bleedPx = inToPx(bleedIn, dpi);
  const safeMarginPx = inToPx(safeMarginIn, dpi);
  
  // Calculate viewport scale to fit container
  const updateStageScale = useCallback(() => {
    if (!containerRef.current) return;
    
    const containerWidth = containerRef.current.clientWidth - 100; // Leave space for rulers
    const containerHeight = containerRef.current.clientHeight - 100;
    
    const scaleX = containerWidth / bannerPxW;
    const scaleY = containerHeight / bannerPxH;
    const scale = Math.min(scaleX, scaleY, 1); // Don't scale up beyond 100%
    
    setStageScale(scale);
  }, [bannerPxW, bannerPxH]);
  
  useEffect(() => {
    updateStageScale();
    window.addEventListener('resize', updateStageScale);
    return () => window.removeEventListener('resize', updateStageScale);
  }, [updateStageScale]);

  // Emit state changes
  const emitStateChange = useCallback(() => {
    if (!imageNode || !onChange) return;
    
    const state: ExportState = {
      stageZoom: stageScale,
      image: {
        x: imageNode.x(),
        y: imageNode.y(),
        scaleX: imageNode.scaleX(),
        scaleY: imageNode.scaleY(),
        rotation: imageNode.rotation(),
        widthPx: image?.naturalWidth || 0,
        heightPx: image?.naturalHeight || 0
      }
    };
    
    onChange(state);
  }, [imageNode, stageScale, image, onChange]);

  // Debounced state emission
  useEffect(() => {
    const timer = setTimeout(emitStateChange, 100);
    return () => clearTimeout(timer);
  }, [emitStateChange]);

