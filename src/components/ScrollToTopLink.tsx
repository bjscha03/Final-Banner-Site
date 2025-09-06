import React from 'react';
import { Link, LinkProps } from 'react-router-dom';

interface ScrollToTopLinkProps extends LinkProps {
  children: React.ReactNode;
  className?: string;
}

const ScrollToTopLink: React.FC<ScrollToTopLinkProps> = ({ 
  to, 
  children, 
  className,
  ...props 
}) => {
  const handleClick = () => {
    // Small delay to ensure navigation happens first
    setTimeout(() => {
      window.scrollTo({ 
        top: 0, 
        behavior: 'smooth' 
      });
    }, 100);
  };

  return (
    <Link 
      to={to} 
      className={className}
      onClick={handleClick}
      {...props}
    >
      {children}
    </Link>
  );
};

export default ScrollToTopLink;
