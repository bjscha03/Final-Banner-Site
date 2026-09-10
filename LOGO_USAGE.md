# Banners On The Fly - Logo Usage Guide

## Logo Assets

This project includes several optimized logo variants for different use cases:

### Available Logo Files

1. **`/public/images/logo-full.svg`** (500×150px)
   - Full horizontal logo with banner icon and complete text
   - Best for: Headers, footers, business cards, letterheads
   - Usage: When you have adequate horizontal space

2. **`/public/images/logo-compact.svg`** (300×90px)
   - Compact version for smaller spaces
   - Best for: Navigation bars, mobile headers, small print materials
   - Usage: When horizontal space is limited

3. **`/public/images/logo-icon.svg`** (80×80px)
   - Square icon version with "B" initial
   - Best for: Favicons, app icons, social media profile pictures
   - Usage: When only a small square space is available

4. **`/public/images/logo-hero.svg`** (800×240px)
   - Large version with enhanced styling and decorative elements
   - Best for: Hero sections, marketing materials, presentations
   - Usage: When you want maximum visual impact

5. **`/public/images/logo-social.svg`** (1200×630px)
   - Social media sharing image with background and tagline
   - Best for: Open Graph images, Twitter cards, social sharing
   - Usage: Automatically used for social media previews

6. **`/public/favicon.svg`** (32×32px)
   - Optimized favicon version
   - Best for: Browser tabs, bookmarks
   - Usage: Automatically loaded by browsers

## React Component Usage

Use the `Logo` component for consistent logo implementation:

```tsx
import Logo from '@/components/Logo';

// Full logo (default)
<Logo />

// Compact version for headers
<Logo variant="compact" height={40} />

// Icon only
<Logo variant="icon" />

// Hero version for landing pages
<Logo variant="hero" width={400} />

// With custom styling
<Logo variant="compact" className="hover:opacity-80 transition-opacity" />
```

### Available Props

- `variant`: 'full' | 'compact' | 'icon' | 'hero' (default: 'full')
- `className`: Additional CSS classes
- `width`: Custom width (overrides default)
- `height`: Custom height (overrides default)

## Design Specifications

### Colors
- **Primary Flag Gradient**: #FF8C42 to #FF6B35 to #E55A4F (orange to red)
- **Blue Triangle Accent**: #1E40AF (with 90% opacity)
- **Text Color**: #1E3A8A (dark blue)
- **Subtitle Color**: #FF6B35 (orange)
- **Brown Pole**: #8B4513
- **Stroke Color**: #D35400 (dark orange)

### Typography
- **Font Family**: Arial, Helvetica, sans-serif
- **Main Text**: Bold weight with letter spacing
- **Subtitle**: Semi-bold weight

### Banner Design
- Flowing flag shape with curved edges and wavy bottom
- Orange-to-red gradient fill with professional drop shadow
- Blue triangle accent in the top-left corner
- Wooden pole on the left side
- Enhanced shadow effects for depth

## Implementation Examples

### Header Usage
```tsx
// Current header implementation
<ScrollToTopLink to="/" className="flex items-center hover:opacity-80 transition-opacity">
  <Logo variant="compact" height={40} className="h-10" />
</ScrollToTopLink>
```

### Hero Section Usage
```tsx
// For hero sections or landing pages
<div className="text-center mb-8">
  <Logo variant="hero" className="mx-auto mb-4" />
  <p className="text-xl text-gray-600">Professional banners delivered fast</p>
</div>
```

## File Optimization

All SVG files are optimized for web use with:
- Minimal file sizes
- Scalable vector graphics
- Proper accessibility attributes
- Cross-browser compatibility
- Retina display support

## Brand Guidelines

### Do's
- Use the logo on clean, uncluttered backgrounds
- Maintain proper spacing around the logo
- Use the appropriate variant for each context
- Preserve the aspect ratio when resizing

### Don'ts
- Don't modify the colors or design elements
- Don't stretch or distort the logo
- Don't use on busy or conflicting backgrounds
- Don't recreate the logo in different fonts

## Technical Notes

- All logos are SVG format for crisp display at any size
- Gradients and filters are embedded for consistent rendering
- Text elements use web-safe fonts with fallbacks
- Drop shadows enhance visibility on various backgrounds
- Optimized for both light and dark themes (where applicable)

## Updates and Maintenance

When updating logos:
1. Maintain consistent design elements across all variants
2. Test on different backgrounds and screen sizes
3. Verify accessibility and contrast ratios
4. Update this documentation with any changes
5. Consider creating additional variants if needed

For questions about logo usage or to request additional variants, please refer to the design team or project maintainer.
