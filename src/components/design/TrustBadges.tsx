import React from 'react';
import { Plane, Clock, FileCheck2, Shield } from 'lucide-react';

const TrustBadges: React.FC = () => {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
          <div className="flex-shrink-0 w-10 h-10 bg-green-100 rounded-full flex items-center justify-center"><Plane className="h-5 w-5 text-green-600" /></div>
          <div className="flex-1 min-w-0"><p className="text-xs text-gray-600 font-medium">Carrier Transit</p><p className="text-sm font-bold text-gray-900">Free Next-Day Air</p></div>
        </div>
        <div className="flex items-center gap-3 p-3 bg-orange-50 rounded-lg">
          <div className="flex-shrink-0 w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center"><Clock className="h-5 w-5 text-orange-600" /></div>
          <div className="flex-1 min-w-0"><p className="text-xs text-gray-600 font-medium">Standard Production</p><p className="text-sm font-bold text-gray-900">Most Within 24 Hours</p></div>
        </div>
        <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
          <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center"><FileCheck2 className="h-5 w-5 text-blue-600" /></div>
          <div className="flex-1 min-w-0"><p className="text-xs text-gray-600 font-medium">Artwork Review</p><p className="text-sm font-bold text-gray-900">Live Preview</p></div>
        </div>
        <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-lg">
          <div className="flex-shrink-0 w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center"><Shield className="h-5 w-5 text-purple-600" /></div>
          <div className="flex-1 min-w-0"><p className="text-xs text-gray-600 font-medium">Damage or Defects</p><p className="text-sm font-bold text-gray-900">Eligible Reprints</p></div>
        </div>
      </div>
    </div>
  );
};

export default TrustBadges;
