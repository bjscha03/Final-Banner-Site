import React from 'react';
import { Button } from '@/components/ui/button';
import { Download, Save, Eye, Sparkles, Grid3x3, Ruler, Undo2, Redo2 } from 'lucide-react';
import { useEditorStore } from '@/store/editor';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu';

interface EditorToolbarProps {
  onOpenAIModal?: () => void;
  onExport?: (format: 'print-pdf' | 'proof-pdf' | 'png') => void;
  onSave?: () => void;
}

const EditorToolbar: React.FC<EditorToolbarProps> = ({ onOpenAIModal, onExport, onSave }) => {
  const {
    showGrid,
    showRulers,
    showBleed,
    showSafeZone,
    showGrommets,
    setShowGrid,
    setShowRulers,
    setShowBleed,
    setShowSafeZone,
    setShowGrommets,
    undo,
    redo,
    canUndo,
    canRedo,
    projectTitle,
  } = useEditorStore();

  return (
    <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <h2 className="text-lg font-semibold text-gray-900">{projectTitle}</h2>
        
        {/* Undo/Redo */}
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={undo}
            disabled={!canUndo()}
            title="Undo (Cmd/Ctrl+Z)"
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={redo}
            disabled={!canRedo()}
            title="Redo (Cmd/Ctrl+Shift+Z)"
          >
            <Redo2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        {/* View Options */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Eye className="h-4 w-4 mr-2" />
              View
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuCheckboxItem
              checked={showGrid}
              onCheckedChange={setShowGrid}
            >
              <Grid3x3 className="h-4 w-4 mr-2" />
              Show Grid
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={showRulers}
              onCheckedChange={setShowRulers}
            >
              <Ruler className="h-4 w-4 mr-2" />
              Show Rulers
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={showBleed}
              onCheckedChange={setShowBleed}
            >
              Bleed Area
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={showSafeZone}
              onCheckedChange={setShowSafeZone}
            >
              Safe Zone
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={showGrommets}
              onCheckedChange={setShowGrommets}
            >
              Grommets
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button 
          variant="outline" 
          size="sm"
          onClick={() => {
            console.log('[EditorToolbar] Save button clicked');
            onSave?.();
          }}
        >
          <Save className="h-4 w-4 mr-2" />
          Save
        </Button>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="default" size="sm" className="bg-[#18448D] hover:bg-[#0f2d5c]">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => {
              console.log('[EditorToolbar] Export Print-Ready PDF clicked');
              onExport?.('print-pdf');
            }}>
              Print-Ready PDF
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => {
              console.log('[EditorToolbar] Export Proof PDF clicked');
              onExport?.('proof-pdf');
            }}>
              Proof PDF (with guides)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => {
              console.log('[EditorToolbar] Export Large PNG clicked');
              onExport?.('png');
            }}>
              Large PNG
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

export default EditorToolbar;
