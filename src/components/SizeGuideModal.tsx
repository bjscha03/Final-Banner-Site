import React from 'react';
import { X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface SizeGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SizeGuideModal: React.FC<SizeGuideModalProps> = ({ isOpen, onClose }) => {
  const commonSizes = [
    { name: 'Small Banner', dimensions: '18" × 24"', sqft: '3 sq ft', uses: 'Yard signs, small announcements' },
    { name: 'Medium Banner', dimensions: '24" × 48" (2×4 ft)', sqft: '8 sq ft', uses: 'Events, retail displays' },
    { name: 'Large Banner', dimensions: '36" × 72" (3×6 ft)', sqft: '18 sq ft', uses: 'Storefronts, trade shows' },
    { name: 'Extra Large', dimensions: '48" × 96" (4×8 ft)', sqft: '32 sq ft', uses: 'Building facades, large events' },
    { name: 'Billboard Style', dimensions: '60" × 120" (5×10 ft)', sqft: '50 sq ft', uses: 'Outdoor advertising, festivals' },
    { name: 'Jumbo Banner', dimensions: '72" × 144" (6×12 ft)', sqft: '72 sq ft', uses: 'Large outdoor displays' },
  ];

  const tips = [
    {
      title: 'Viewing Distance',
      description: 'For every 10 feet of viewing distance, use at least 1 inch of letter height. Example: 50 feet away = 5" tall letters.'
    },
    {
      title: 'Standard Sizes',
      description: 'Common sizes are based on feet: 2×4, 3×6, 4×8, 5×10. These are cost-effective and easy to display.'
    },
    {
      title: 'Custom Sizes',
      description: 'We can print any size from 1" to 1000" in width or height. Pricing is based on total square footage.'
    },
    {
      title: 'Orientation',
      description: 'Horizontal (landscape) banners are most common. Vertical (portrait) works well for pole banners and tall displays.'
    },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-slate-900">Banner Size Guide</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Common Sizes Table */}
          <div>
            <h3 className="text-lg font-semibold text-slate-900 mb-3">Popular Banner Sizes</h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200">
                    <th className="text-left py-3 px-4 font-semibold text-sm text-slate-700">Size Name</th>
                    <th className="text-left py-3 px-4 font-semibold text-sm text-slate-700">Dimensions</th>
                    <th className="text-left py-3 px-4 font-semibold text-sm text-slate-700">Area</th>
                    <th className="text-left py-3 px-4 font-semibold text-sm text-slate-700">Best For</th>
                  </tr>
                </thead>
                <tbody>
                  {commonSizes.map((size, index) => (
                    <tr key={index} className="border-b border-slate-200 hover:bg-slate-50">
                      <td className="py-3 px-4 font-medium text-slate-900">{size.name}</td>
                      <td className="py-3 px-4 text-slate-700">{size.dimensions}</td>
                      <td className="py-3 px-4 text-slate-700">{size.sqft}</td>
                      <td className="py-3 px-4 text-sm text-slate-600">{size.uses}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Visual Size Comparison */}
          <div>
            <h3 className="text-lg font-semibold text-slate-900 mb-3">Visual Size Comparison</h3>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-6">
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-8 bg-blue-500 rounded shadow-sm"></div>
                  <span className="text-sm text-slate-700">2×4 ft (24" × 48")</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-20 h-12 bg-blue-500 rounded shadow-sm"></div>
                  <span className="text-sm text-slate-700">3×6 ft (36" × 72")</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-28 h-16 bg-blue-500 rounded shadow-sm"></div>
                  <span className="text-sm text-slate-700">4×8 ft (48" × 96")</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-36 h-20 bg-blue-500 rounded shadow-sm"></div>
                  <span className="text-sm text-slate-700">5×10 ft (60" × 120")</span>
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-4 italic">* Sizes shown to scale relative to each other</p>
            </div>
          </div>

          {/* Tips & Guidelines */}
          <div>
            <h3 className="text-lg font-semibold text-slate-900 mb-3">Sizing Tips & Guidelines</h3>
            <div className="grid md:grid-cols-2 gap-4">
              {tips.map((tip, index) => (
                <div key={index} className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-semibold text-slate-900 mb-2">{tip.title}</h4>
                  <p className="text-sm text-slate-700">{tip.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Reference */}
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
            <h4 className="font-semibold text-slate-900 mb-2">💡 Quick Reference</h4>
            <ul className="space-y-2 text-sm text-slate-700">
              <li>• <strong>Indoor use:</strong> Smaller sizes (2×4 to 4×8 ft) work well</li>
              <li>• <strong>Outdoor/Street view:</strong> Larger sizes (4×8 to 6×12 ft) for visibility</li>
              <li>• <strong>Trade shows:</strong> 3×6 or 4×8 ft are most popular</li>
              <li>• <strong>Retail windows:</strong> Measure your space, leave 6" margin on all sides</li>
              <li>• <strong>Not sure?</strong> Go slightly larger - banners are more impactful when they're big!</li>
            </ul>
          </div>

          {/* Close Button */}
          <div className="flex justify-end pt-4">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg transition-colors"
            >
              Got it, thanks!
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SizeGuideModal;
