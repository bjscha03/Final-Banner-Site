import React from 'react';
import { X } from 'lucide-react';
import QuickQuote from '@/components/home/QuickQuote';

interface QuickQuoteModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const QuickQuoteModal: React.FC<QuickQuoteModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal container */}
      <div className="relative min-h-screen flex items-start justify-center p-4 pt-8 md:pt-16">
        <div className="relative bg-slate-50 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-y-auto">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white shadow-md hover:bg-slate-100 transition-colors"
            aria-label="Close quick quote"
          >
            <X className="w-5 h-5 text-slate-600" />
          </button>

          {/* QuickQuote content - remove the section wrapper styling */}
          <div className="quick-quote-modal-content">
            <QuickQuote />
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuickQuoteModal;

