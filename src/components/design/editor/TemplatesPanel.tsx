import React, { useState } from 'react';
import { useEditorStore } from '@/store/editor';
import { useQuoteStore } from '@/store/quote';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Template {
  id: string;
  name: string;
  description: string;
  objects: any[];
}

const TemplatesPanel: React.FC = () => {
  const { widthIn, heightIn } = useQuoteStore();
  const { loadFromJSON, reset } = useEditorStore();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);

  const templates: Template[] = [
    {
      id: 'centered-text',
      name: 'Centered Text',
      description: 'Large heading with subtext',
      objects: [
        {
          type: 'text',
          content: 'YOUR MESSAGE HERE',
          x: widthIn / 2 - 5,
          y: heightIn / 2 - 2,
          width: 10,
          height: 2,
          rotation: 0,
          opacity: 1,
          locked: false,
          visible: true,
          fontFamily: 'Arial',
          fontSize: 96,
          color: '#18448D',
          fontWeight: 'bold',
          fontStyle: 'normal',
          textDecoration: 'none',
          textAlign: 'center',
          lineHeight: 1.2,
          letterSpacing: 0,
          effect: 'none',
        },
        {
          type: 'text',
          content: 'Subheading text goes here',
          x: widthIn / 2 - 4,
          y: heightIn / 2 + 1,
          width: 8,
          height: 1.5,
          rotation: 0,
          opacity: 1,
          locked: false,
          visible: true,
          fontFamily: 'Arial',
          fontSize: 48,
          color: '#1f2937',
          fontWeight: 'normal',
          fontStyle: 'normal',
          textDecoration: 'none',
          textAlign: 'center',
          lineHeight: 1.2,
          letterSpacing: 0,
          effect: 'none',
        },
      ],
    },
    {
      id: 'left-aligned',
      name: 'Left Aligned',
      description: 'Text aligned to left with accent',
      objects: [
        {
          type: 'shape',
          shapeType: 'rect',
          x: 1,
          y: 1,
          width: 0.5,
          height: heightIn - 2,
          rotation: 0,
          opacity: 1,
          locked: false,
          visible: true,
          fill: '#ff6b35',
          stroke: '#ff6b35',
          strokeWidth: 0,
        },
        {
          type: 'text',
          content: 'BOLD STATEMENT',
          x: 2,
          y: heightIn / 2 - 2,
          width: 12,
          height: 2,
          rotation: 0,
          opacity: 1,
          locked: false,
          visible: true,
          fontFamily: 'Arial',
          fontSize: 84,
          color: '#18448D',
          fontWeight: 'bold',
          fontStyle: 'normal',
          textDecoration: 'none',
          textAlign: 'left',
          lineHeight: 1.2,
          letterSpacing: 0,
          effect: 'none',
        },
      ],
    },
    {
      id: 'corner-accent',
      name: 'Corner Accent',
      description: 'Decorative corner elements',
      objects: [
        {
          type: 'shape',
          shapeType: 'circle',
          x: 2,
          y: 2,
          width: 4,
          height: 4,
          rotation: 0,
          opacity: 0.3,
          locked: false,
          visible: true,
          fill: '#ff6b35',
          stroke: '#ff6b35',
          strokeWidth: 0,
        },
        {
          type: 'shape',
          shapeType: 'circle',
          x: widthIn - 6,
          y: heightIn - 6,
          width: 4,
          height: 4,
          rotation: 0,
          opacity: 0.3,
          locked: false,
          visible: true,
          fill: '#18448D',
          stroke: '#18448D',
          strokeWidth: 0,
        },
        {
          type: 'text',
          content: 'YOUR TEXT',
          x: widthIn / 2 - 5,
          y: heightIn / 2 - 1.5,
          width: 10,
          height: 3,
          rotation: 0,
          opacity: 1,
          locked: false,
          visible: true,
          fontFamily: 'Arial',
          fontSize: 96,
          color: '#1f2937',
          fontWeight: 'bold',
          fontStyle: 'normal',
          textDecoration: 'none',
          textAlign: 'center',
          lineHeight: 1.2,
          letterSpacing: 0,
          effect: 'none',
        },
      ],
    },
    {
      id: 'split-design',
      name: 'Split Design',
      description: 'Two-tone background split',
      objects: [
        {
          type: 'shape',
          shapeType: 'rect',
          x: 0,
          y: 0,
          width: widthIn / 2,
          height: heightIn,
          rotation: 0,
          opacity: 0.2,
          locked: false,
          visible: true,
          fill: '#18448D',
          stroke: 'transparent',
          strokeWidth: 0,
        },
        {
          type: 'text',
          content: 'SPLIT',
          x: widthIn / 4 - 3,
          y: heightIn / 2 - 1.5,
          width: 6,
          height: 3,
          rotation: 0,
          opacity: 1,
          locked: false,
          visible: true,
          fontFamily: 'Arial',
          fontSize: 72,
          color: '#18448D',
          fontWeight: 'bold',
          fontStyle: 'normal',
          textDecoration: 'none',
          textAlign: 'center',
          lineHeight: 1.2,
          letterSpacing: 0,
          effect: 'none',
        },
        {
          type: 'text',
          content: 'DESIGN',
          x: (widthIn * 3) / 4 - 3,
          y: heightIn / 2 - 1.5,
          width: 6,
          height: 3,
          rotation: 0,
          opacity: 1,
          locked: false,
          visible: true,
          fontFamily: 'Arial',
          fontSize: 72,
          color: '#ff6b35',
          fontWeight: 'bold',
          fontStyle: 'normal',
          textDecoration: 'none',
          textAlign: 'center',
          lineHeight: 1.2,
          letterSpacing: 0,
          effect: 'none',
        },
      ],
    },
  ];

  const handleTemplateClick = (template: Template) => {
    setSelectedTemplate(template);
    setConfirmOpen(true);
  };

  const handleConfirmLoad = () => {
    if (selectedTemplate) {
      const json = JSON.stringify({ objects: selectedTemplate.objects, customSwatches: [] });
      loadFromJSON(json);
      setConfirmOpen(false);
      setSelectedTemplate(null);
    }
  };

  return (
    <>
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-900">Starter Layouts</h3>
        <div className="grid grid-cols-2 gap-3">
          {templates.map((template) => (
            <Card
              key={template.id}
              className="p-3 cursor-pointer hover:border-[#18448D] hover:shadow-md transition-all"
              onClick={() => handleTemplateClick(template)}
            >
              <div className="aspect-video bg-gray-100 rounded mb-2 flex items-center justify-center">
                <span className="text-2xl">📐</span>
              </div>
              <h4 className="text-xs font-semibold text-gray-900">{template.name}</h4>
              <p className="text-xs text-gray-500 mt-1">{template.description}</p>
            </Card>
          ))}
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace Current Design?</AlertDialogTitle>
            <AlertDialogDescription>
              This will replace your current design with the "{selectedTemplate?.name}" template. This action cannot be undone (but you can use Undo after loading).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmLoad} className="bg-[#18448D] hover:bg-[#0f2d5c]">
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default TemplatesPanel;
