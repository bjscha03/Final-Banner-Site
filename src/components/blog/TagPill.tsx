/**
 * Tag Pill Component
 * Enhanced with gradients, shadows, and smooth hover effects
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { Tag } from 'lucide-react';

interface TagPillProps {
  tag: string;
  linkTo?: boolean;
  onClick?: () => void;
  active?: boolean;
  showIcon?: boolean;
}

export function TagPill({ tag, linkTo = false, onClick, active = false, showIcon = false }: TagPillProps) {
  const baseClasses = "inline-flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm font-semibold transition-all duration-300 transform hover:scale-105 min-h-[32px] border";
  
  const colorClasses = active
    ? "bg-gradient-to-r from-[#18448D] to-[#1a5bc4] text-white border-transparent shadow-md hover:shadow-lg hover:from-[#ff6b35] hover:to-[#f7931e]"
    : "bg-white text-gray-700 border-gray-200 hover:bg-[#18448D] hover:text-white hover:border-[#18448D] hover:shadow-md";
  
  const className = `${baseClasses} ${colorClasses}`;
  
  const content = (
    <>
      {showIcon && <Tag className="w-3 h-3" />}
      {tag}
    </>
  );
  
  if (linkTo) {
    return (
      <Link to={`/blog/tags/${encodeURIComponent(tag.toLowerCase())}`} className={className}>
        {content}
      </Link>
    );
  }
  
  if (onClick) {
    return (
      <button onClick={onClick} className={className}>
        {content}
      </button>
    );
  }
  
  return <span className={className}>{content}</span>;
}
