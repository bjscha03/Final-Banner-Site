import React from 'react';
import { LucideIcon } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  gradient?: boolean;
  centered?: boolean;
}

/**
 * PageHeader Component
 * 
 * A restrained page title header shared by the site's utility pages.
 * Solid navy avoids decorative seams and partial rules across wide screens.
 *
 * @param title - The main page title (required)
 * @param subtitle - Optional descriptive text below the title
 * @param icon - Optional Lucide icon component to display next to the title
 * @param gradient - Whether to use gradient background (default: true)
 * @param centered - Whether to center the content (default: true)
 */
const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  icon: Icon,
  centered = true,
}) => {
  return (
    <div
      data-page-header
      className="relative overflow-hidden border-b border-white/10 bg-[#0B1F3A]"
    >
      <div className="relative mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
        <div className={centered ? 'text-center' : ''}>
          <div className={`flex items-center gap-4 ${centered ? 'justify-center' : ''}`}>
            {Icon && (
              <div className="flex h-12 w-12 flex-none items-center justify-center border border-white/25 bg-white/5">
                <Icon className="h-6 w-6 text-[#FF6A00]" />
              </div>
            )}
            <h1 className="font-display text-3xl font-bold leading-tight tracking-[-0.035em] text-white sm:text-4xl lg:text-5xl">
              {title}
            </h1>
          </div>

          {subtitle && (
            <p className={`mt-5 text-base leading-7 text-slate-300 sm:text-lg sm:leading-8 ${
              centered ? 'max-w-3xl mx-auto' : 'max-w-3xl'
            }`}>
              {subtitle}
            </p>
          )}

          <div className={`mt-7 ${centered ? 'flex justify-center' : ''}`}>
            <div className="h-1 w-12 bg-[#FF6A00]" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default PageHeader;
