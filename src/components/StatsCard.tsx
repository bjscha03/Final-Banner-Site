import React from 'react';
import { LucideIcon } from 'lucide-react';

interface StatsCardProps {
  icon: LucideIcon;
  value: string;
  label: string;
  sublabel?: string;
}

const StatsCard: React.FC<StatsCardProps> = ({ icon: Icon, value, label, sublabel }) => {
  return (
    <div className="stat-card text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/10 mb-4">
        <Icon className="h-8 w-8 text-amber-400" />
      </div>
      <div className="text-4xl md:text-5xl font-extrabold text-white mb-2">
        {value}
      </div>
      <div className="text-slate-200/80 font-medium">
        {label}
      </div>
      {sublabel && (
        <div className="text-slate-300/60 text-sm mt-1">
          {sublabel}
        </div>
      )}
    </div>
  );
};

export default StatsCard;
