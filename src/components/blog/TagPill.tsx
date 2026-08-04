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
  const className = `inline-flex min-h-8 items-center gap-1.5 border-b-2 px-1 py-1 text-xs font-bold uppercase tracking-[0.08em] transition-colors ${active ? 'border-[#FF6A00] text-[#0B1F3A]' : 'border-transparent text-slate-500 hover:text-[#D95700]'}`;
  const content = <>{showIcon && <Tag className="h-3 w-3" />}{tag}</>;
  if (linkTo) return <Link to={`/blog/tags/${encodeURIComponent(tag.toLowerCase())}`} className={className}>{content}</Link>;
  if (onClick) return <button onClick={onClick} className={className}>{content}</button>;
  return <span className={className}>{content}</span>;
}
