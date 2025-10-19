/**
 * Tag Pill Component
 */

import React from 'react';
import { Link } from 'react-router-dom';

interface TagPillProps {
  tag: string;
  linkTo?: boolean;
  onClick?: () => void;
  active?: boolean;
}

export function TagPill({ tag, linkTo = false, onClick, active = false }: TagPillProps) {
  const baseClasses = "inline-block px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-sm font-semibold transition-all hover:scale-105 min-h-[32px] flex items-center";
  const colorClasses = active
    ? "bg-[#18448D] text-white shadow-md"
    : "bg-gray-100 text-gray-700 hover:bg-[#18448D] hover:text-white hover:shadow-md";
  
  const className = `${baseClasses} ${colorClasses}`;
  
  if (linkTo) {
    return (
      <Link to={`/blog/tags/${encodeURIComponent(tag.toLowerCase())}`} className={className}>
        {tag}
      </Link>
    );
  }
  
  if (onClick) {
    return (
      <button onClick={onClick} className={className}>
        {tag}
      </button>
    );
  }
  
  return <span className={className}>{tag}</span>;
}
