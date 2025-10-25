import React from 'react';
import { Plane, Clock, Users, Shield } from 'lucide-react';

const TrustBadges: React.FC = () => {
  const uploadCount = 1247;
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
          <div className="flex-shrink-0 w-10 h-10 bg-green-100 rounded-full flex items-center justify-center"><Plane className="h-5 w-5 text-green-600" /></div>
          <div className="flex-1 min-w-0"><p className="text-xs text-gray-600 font-medium">Free Shipping</p><p className="text-sm font-bold text-gray-900">Next Day Air</p></div>
        </div>
        <div className="flex items-center gap-3 p-3 bg-orange-50 rounded-lg">
          <div className="flex-shrink-0 w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center"><Clock className="h-5 w-5 text-orange-600" /></div>
          <div className="flex-1 min-w-0"><p className="text-xs text-gray-600 font-medium">Quick Turnaround</p><p className="text-sm font-bold text-gray-900">Ships Tomorrow</p></div>
        </div>
        <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
          <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center"><Users className="h-5 w-5 text-blue-600" /></div>
          <div className="flex-1 min-w-0"><p className="text-xs text-gray-600 font-medium">This Week</p><p className="text-sm font-bold text-gray-900">{uploadCount.toLocaleString()}+ Orders</p></div>
        </div>
        <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-lg">
          <div className="flex-shrink-0 w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center"><Shield className="h-5 w-5 text-purple-600" /></div>
          <div className="flex-1 min-w-0"><p className="text-xs text-gray-600 font-medium">Quality Promise</p><p className="text-sm font-bold text-gray-900">100% Guaranteed</p></div>
        </div>
      </div>
    </div>
  );
};

export default TrustBadges;
