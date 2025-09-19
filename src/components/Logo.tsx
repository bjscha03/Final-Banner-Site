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
        return { width: 200, height: 60 };
      case 'icon':
        return { width: 60, height: 60 };
      case 'hero':
        return { width: 600, height: 180 };
      default:
        return { width: 400, height: 120 };
    }
  };

  const defaultDimensions = getDefaultDimensions();
  const logoWidth = width || defaultDimensions.width;
  const logoHeight = height || defaultDimensions.height;

  return (
    <img
      src={getLogoPath()}
      alt="Banners On The Fly"
      width={logoWidth}
      height={logoHeight}
      className={`${className} ${animated ? 'hover:scale-105 transition-transform duration-300' : ''}`}
      style={{
        maxWidth: '100%',
        height: 'auto',
        filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))'
      }}
    />
  );
};

export default Logo;
