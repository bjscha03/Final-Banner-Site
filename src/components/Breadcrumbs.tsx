/**
 * Breadcrumb Navigation Component
 * Displays hierarchical navigation with schema.org markup
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

export interface BreadcrumbItem {
  name: string;
  url: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ items, className = '' }) => {
  if (!items || items.length === 0) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className={`flex items-center text-sm text-gray-600 mb-6 ${className}`}
    >
      <ol className="flex items-center flex-wrap gap-2">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          const isHome = index === 0 && item.url === '/';

          return (
            <li key={index} className="flex items-center">
              {index > 0 && (
                <ChevronRight className="h-4 w-4 mx-2 text-gray-400" aria-hidden="true" />
              )}
              
              {isLast ? (
                <span
                  className="text-gray-900 font-medium"
                  aria-current="page"
                >
                  {isHome && <Home className="h-4 w-4 inline mr-1" aria-hidden="true" />}
                  {item.name}
                </span>
              ) : (
                <Link
                  to={item.url}
                  className="text-[#18448D] hover:text-[#ff6b35] hover:underline transition-colors"
                >
                  {isHome && <Home className="h-4 w-4 inline mr-1" aria-hidden="true" />}
                  {item.name}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

export default Breadcrumbs;
