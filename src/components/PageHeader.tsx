import React from 'react';
import { LucideIcon } from 'lucide-react';
import HeroDeliveryStatus from '@/components/delivery/HeroDeliveryStatus';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  gradient?: boolean;
  centered?: boolean;
}

const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  icon: Icon,
  centered = true,
}) => {
  return (
    <div data-page-header className="relative border-b border-[#e5dfd6] bg-[#f8f6f1] text-[#061A31]">
      <div className="relative mx-auto max-w-[1500px] px-5 py-12 sm:px-8 sm:py-16 lg:px-12 lg:py-20">
        <div className={centered ? 'text-center' : ''}>
          <div className={`flex flex-col gap-4 sm:flex-row sm:items-center ${centered ? 'justify-center' : ''}`}>
            {Icon && (
              <div className="flex h-12 w-12 flex-none items-center justify-center border border-[#F45B08] bg-white">
                <Icon className="h-6 w-6 text-[#F45B08]" />
              </div>
            )}
            <h1 className="max-w-5xl break-words font-sans text-[clamp(2.3rem,5vw,4.75rem)] font-bold leading-[1.06] tracking-[-0.045em] text-[#061A31]">
              {title}
            </h1>
          </div>

          {subtitle && (
            <p className={`mt-5 text-base leading-7 text-[#344860] sm:text-lg sm:leading-8 ${
              centered ? 'max-w-3xl mx-auto' : 'max-w-3xl'
            }`}>
              {subtitle}
            </p>
          )}

          <div className={`mt-7 ${centered ? 'flex justify-center' : ''}`}>
            <div className="h-1 w-16 bg-brand-orange text-white" />
          </div>
          <div className={`mt-7 ${centered ? 'flex justify-center' : ''}`}>
            <HeroDeliveryStatus variant="light" className="w-full max-w-[570px] text-left" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default PageHeader;
