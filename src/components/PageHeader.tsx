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
    <div data-page-header className="relative overflow-hidden border-t-4 border-[#F45B08] bg-[#FBF8F2] text-[#061A31]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_20%,rgba(244,91,8,.10),transparent_28%)]" aria-hidden="true" />
      <div className="relative mx-auto max-w-[1500px] px-5 py-12 sm:px-8 sm:py-16 lg:px-12 lg:py-20">
        <div className={centered ? 'text-center' : ''}>
          <div className={`flex flex-col gap-4 sm:flex-row sm:items-center ${centered ? 'justify-center' : ''}`}>
            {Icon && (
              <div className="flex h-12 w-12 flex-none items-center justify-center border border-[#F45B08] bg-white">
                <Icon className="h-6 w-6 text-[#F45B08]" />
              </div>
            )}
            <h1 className="homepage-condensed break-words [--homepage-mobile-size:3.8rem] text-6xl font-black uppercase leading-[0.9] tracking-[-0.015em] text-[#061A31] sm:text-7xl lg:text-[6rem]">
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
            <div className="h-1 w-16 bg-[#F45B08]" />
          </div>
          <div className={`mt-7 ${centered ? 'flex justify-center' : ''}`}>
            <HeroDeliveryStatus className="w-full max-w-[570px] text-left" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default PageHeader;
