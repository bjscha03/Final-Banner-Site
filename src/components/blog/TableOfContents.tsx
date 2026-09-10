/**
 * Table of Contents Component
 * Mobile-first with collapsible dropdown on mobile, sticky sidebar on desktop
 */

import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, List } from 'lucide-react';

interface TOCItem {
  id: string;
  text: string;
  level: number;
}

interface TableOfContentsProps {
  content: string;
}

export function TableOfContents({ content }: TableOfContentsProps) {
  const [headings, setHeadings] = useState<TOCItem[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [isOpen, setIsOpen] = useState(false);
  
  useEffect(() => {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = content;
    
    const headingElements = tempDiv.querySelectorAll('h2, h3');
    const items: TOCItem[] = Array.from(headingElements).map((heading, index) => {
      const id = (heading.textContent || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `heading-${index}`;
      return {
        id,
        text: heading.textContent || '',
        level: parseInt(heading.tagName.substring(1)),
      };
    });
    
    setHeadings(items);
  }, [content]);
  
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      { rootMargin: '-100px 0px -66%' }
    );
    
    headings.forEach(({ id }) => {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    });
    
    return () => observer.disconnect();
  }, [headings]);
  
  const handleLinkClick = () => {
    // Close mobile menu after clicking a link
    if (window.innerWidth < 1024) {
      setIsOpen(false);
    }
  };
  
  if (headings.length === 0) return null;
  
  return (
    <nav className="lg:sticky lg:top-24 bg-white rounded-lg shadow-md mb-8 lg:mb-0">
      {/* Mobile: Collapsible Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="lg:hidden w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors rounded-t-lg"
        aria-expanded={isOpen}
        aria-controls="toc-content"
      >
        <div className="flex items-center gap-2">
          <List className="h-5 w-5 text-[#18448D]" />
          <h3 className="text-lg font-bold text-gray-900">Table of Contents</h3>
        </div>
        {isOpen ? (
          <ChevronUp className="h-5 w-5 text-[#18448D]" />
        ) : (
          <ChevronDown className="h-5 w-5 text-[#18448D]" />
        )}
      </button>
      
      {/* Desktop: Always visible header */}
      <div className="hidden lg:block p-6 pb-4">
        <div className="flex items-center gap-2 mb-4">
          <List className="h-5 w-5 text-[#18448D]" />
          <h3 className="text-lg font-bold text-gray-900">Table of Contents</h3>
        </div>
      </div>
      
      {/* Content: Collapsible on mobile, always visible on desktop */}
      <div
        id="toc-content"
        className={`
          overflow-hidden transition-all duration-300 ease-in-out
          ${isOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}
          lg:max-h-none lg:opacity-100
        `}
      >
        <ul className="space-y-2 p-4 pt-0 lg:px-6 lg:pb-6">
          {headings.map(({ id, text, level }) => (
            <li key={id} className={level === 3 ? 'ml-4' : ''}>
              <a
                href={`#${id}`}
                onClick={handleLinkClick}
                className={`
                  block text-sm transition-colors py-1.5 px-2 rounded
                  hover:bg-gray-50
                  ${
                    activeId === id
                      ? 'text-[#18448D] font-semibold bg-blue-50'
                      : 'text-gray-600 hover:text-[#18448D]'
                  }
                `}
              >
                {text}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
