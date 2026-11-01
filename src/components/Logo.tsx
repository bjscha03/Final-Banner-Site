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
        return '/images/bof-logo-20261101.png';
      case 'icon':
        return '/images/bof-icon-20261101.png';
      case 'hero':
        return '/images/bof-logo-20261101.png';
      default:
        return '/images/bof-logo-20261101.png';
    }
  };

  const getDefaultDimensions = () => {
    switch (variant) {
      case 'compact':
        return { width: 240, height: 57 };
      case 'icon':
        return { width: 80, height: 80 };
      case 'hero':
        return { width: 800, height: 189 };
      default:
        return { width: 500, height: 118 };
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
      className={`site-logo w-auto object-contain ${className} ${animated ? 'hover:scale-105 transition-transform duration-300' : ''}`}
      style={{
        maxWidth: '100%'
      }}
    />
  );
};

export default Logo;
