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
 * A reusable, visually appealing page title header component that matches
 * the site's branding and design system.
 * 
 * Features:
 * - Consistent typography and spacing across all pages
 * - Optional icon support
 * - Optional subtitle text
 * - Gradient background option
 * - Responsive design (mobile, tablet, desktop)
 * - Brand colors: #18448D (primary blue), #ff6b35 or #f7931e (orange accents)
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
  gradient = true,
  centered = true,
}) => {
  return (
    <div
      className={`relative overflow-hidden ${
        gradient
          ? 'bg-gradient-to-br from-[#18448D] via-[#1a4d9f] to-[#1556b1]'
          : 'bg-[#18448D]'
      }`}
    >
      {/* Decorative background pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }} />
      </div>

      {/* Content */}
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 md:py-20">
        <div className={centered ? 'text-center' : ''}>
          {/* Icon and Title */}
          <div className={`flex items-center ${centered ? 'justify-center' : ''} space-x-3 sm:space-x-4 mb-4 sm:mb-6`}>
            {Icon && (
              <div className="flex-shrink-0">
                <Icon className="h-8 w-8 sm:h-10 sm:w-10 md:h-12 md:w-12 text-[#ff6b35]" />
              </div>
            )}
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-white tracking-tight leading-tight">
              {title}
            </h1>
          </div>

          {/* Subtitle */}
          {subtitle && (
            <p className={`text-base sm:text-lg md:text-xl lg:text-2xl text-blue-100 leading-relaxed ${
              centered ? 'max-w-3xl mx-auto' : 'max-w-3xl'
            }`}>
              {subtitle}
            </p>
          )}

          {/* Decorative accent line */}
          <div className={`mt-6 sm:mt-8 ${centered ? 'flex justify-center' : ''}`}>
            <div className="h-1 w-20 sm:w-24 md:w-32 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded-full" />
          </div>
        </div>
      </div>

      {/* Bottom wave decoration */}
      <div className="absolute bottom-0 left-0 right-0">
        <svg
          className="w-full h-4 sm:h-6 md:h-8 text-gray-50"
          preserveAspectRatio="none"
          viewBox="0 0 1200 120"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M0,0V46.29c47.79,22.2,103.59,32.17,158,28,70.36-5.37,136.33-33.31,206.8-37.5C438.64,32.43,512.34,53.67,583,72.05c69.27,18,138.3,24.88,209.4,13.08,36.15-6,69.85-17.84,104.45-29.34C989.49,25,1113-14.29,1200,52.47V0Z"
            opacity=".25"
            fill="currentColor"
          />
          <path
            d="M0,0V15.81C13,36.92,27.64,56.86,47.69,72.05,99.41,111.27,165,111,224.58,91.58c31.15-10.15,60.09-26.07,89.67-39.8,40.92-19,84.73-46,130.83-49.67,36.26-2.85,70.9,9.42,98.6,31.56,31.77,25.39,62.32,62,103.63,73,40.44,10.79,81.35-6.69,119.13-24.28s75.16-39,116.92-43.05c59.73-5.85,113.28,22.88,168.9,38.84,30.2,8.66,59,6.17,87.09-7.5,22.43-10.89,48-26.93,60.65-49.24V0Z"
            opacity=".5"
            fill="currentColor"
          />
          <path
            d="M0,0V5.63C149.93,59,314.09,71.32,475.83,42.57c43-7.64,84.23-20.12,127.61-26.46,59-8.63,112.48,12.24,165.56,35.4C827.93,77.22,886,95.24,951.2,90c86.53-7,172.46-45.71,248.8-84.81V0Z"
            fill="currentColor"
          />
        </svg>
      </div>
    </div>
  );
};

export default PageHeader;
