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
  const baseClasses = "inline-block px-3 py-1 rounded-full text-sm font-medium transition-colors";
  const colorClasses = active
    ? "bg-[#18448D] text-white"
    : "bg-gray-100 text-gray-700 hover:bg-gray-200";
  
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
