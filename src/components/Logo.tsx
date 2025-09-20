import React from 'react';

interface LogoProps {
  variant?: 'full' | 'compact' | 'icon' | 'hero';
  className?: string;
  width?: number;
  height?: number;
  animated?: boolean;
}

const Logo: React.FC<LogoProps> = ({
  variant = 'full',
  className = '',
  width,
  height,
  animated = false
}) => {
  const getLogoPath = () => {
    switch (variant) {
      case 'compact':
        return '/images/logo-compact.svg';
      case 'icon':
        return '/images/logo-icon.svg';
      case 'hero':
        return '/images/logo-hero.svg';
      default:
        return '/images/logo-full.svg';
    }
  };

  const getDefaultDimensions = () => {
    switch (variant) {
      case 'compact':
        return { width: 240, height: 60 };
      case 'icon':
        return { width: 80, height: 80 };
      case 'hero':
        return { width: 800, height: 240 };
      default:
        return { width: 500, height: 150 };
    }
  };

  const defaultDimensions = getDefaultDimensions();
  const logoWidth = width || defaultDimensions.width;
  const logoHeight = height || defaultDimensions.height;

  return (
    <img
      src={getLogoPath()}
      alt="Banners On The Fly"
      className={`site-logo h-8 w-auto md:h-10 object-contain ${className} ${animated ? 'hover:scale-105 transition-transform duration-300' : ''}`}
      style={{
        maxWidth: '100%',
        filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))'
      }}
    />
  );
};

export default Logo;
