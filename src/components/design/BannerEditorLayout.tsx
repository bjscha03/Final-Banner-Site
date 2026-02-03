import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useAuth, isAdmin } from '@/lib/auth';
import { grommetPoints, grommetRadius } from '@/lib/preview/grommets';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { uploadCanvasImageToCloudinary } from '@/utils/uploadCanvasImage';
import { useEditorStore } from '@/store/editor';
import { useQuoteStore } from '@/store/quote';
import { generateFinalRender } from '@/utils/generateFinalRender';
import { useCartStore } from '@/store/cart';
import UpsellModal, { UpsellOption } from '@/components/cart/UpsellModal';
import { 
  Upload, 
  Type, 
  Settings, 
  Maximize2, 
  Wrench,
  ShoppingCart,
  CreditCard,
  Eye,
  Palette, 
  Sliders,
  Download, 
  Sparkles,
  X,
  Grid3X3
} from 'lucide-react';
import EditorCanvas from './editor/EditorCanvas';
import AssetsPanel from './editor/AssetsPanel';
import TextPanel from './editor/TextPanel';
import ObjectInspector from './editor/ObjectInspector';
import BrandColorsPanel from './editor/BrandColorsPanel';
import CanvasSettingsPanel from './editor/CanvasSettingsPanel';
import MaterialCard from './MaterialCard';
import SizeQuantityCard from './SizeQuantityCard';
import OptionsCard from './OptionsCard';
import DesignServicePanel, { DesignServiceAsset } from './DesignServicePanel';
// PricingCard removed - users add to cart via blue button


interface BannerEditorLayoutProps {
  onOpenAIModal?: () => void;
  designServiceMode?: boolean;
  onDesignServiceModeChange?: (mode: boolean) => void;
}

type PanelType = 'uploads' | 'text' | 'material' | 'size' | 'options' | 'inspector' | 'colors' | 'canvas' | null;

const BannerEditorLayout: React.FC<BannerEditorLayoutProps> = ({ 
  onOpenAIModal,
  designServiceMode: externalDesignServiceMode,
  onDesignServiceModeChange
}) => {
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<PanelType>(null);
  const canvasRef = useRef<any>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showUpsellModal, setShowUpsellModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<'cart' | 'checkout' | null>(null);
  const [dontShowUpsellAgain, setDontShowUpsellAgain] = useState(false);

  // Design Service mode state - use external state if provided, otherwise use internal state
  const [internalDesignServiceMode, setInternalDesignServiceMode] = useState(false);
  const designServiceMode = externalDesignServiceMode !== undefined ? externalDesignServiceMode : internalDesignServiceMode;
  const setDesignServiceMode = onDesignServiceModeChange || setInternalDesignServiceMode;
  const [designRequestText, setDesignRequestText] = useState('');
  const [draftPreference, setDraftPreference] = useState<'email' | 'text'>('email');
  const [draftContact, setDraftContact] = useState('');
  const [designUploadedAssets, setDesignUploadedAssets] = useState<DesignServiceAsset[]>([]);