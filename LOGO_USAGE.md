# Banners On The Fly logo

The approved brand artwork is the exact November 1, 2026 upload in
`public/images/bof-logo-20261101.png` (1082 × 255 pixels, white background).
Use this image for the full logo; preserve its lettering, colors, flag, and aspect ratio.

## Website and emails

- Website: `/images/bof-logo-20261101.png`
- Email: `https://bannersonthefly.com/images/bof-logo-20261101.png`
- Square flag icon: `/images/bof-icon-20261101.png`
- React: `Logo` in `src/components/Logo.tsx` supports full, compact, hero, and icon sizes.

Use PNG directly in email templates. Do not use the old Cloudinary fetch URLs:
they can retain the previous logo. Render the logo proportionally with `height:auto`
and a white background. For example, a 240-pixel-wide logo is about 57 pixels tall.

## Generated compatibility assets

`npm run generate:brand-assets` regenerates the legacy PNG/SVG aliases,
browser favicons, and Apple touch icon from the approved source. The square icon
is a crop of the flag from that same upload. Compatibility SVGs embed the
original raster artwork; they are not vector redraws.

The normal production build runs this generator before generating social cards.
Wallet passes bundle the same full logo and square icon. Logo filenames in
templates and browser icon links are versioned to avoid stale image caches.

Keep the old public paths available for older links, but use the versioned files
in new code. A future approved logo change should introduce a new versioned
source and update the generator, email URLs, browser icons, and metadata together.
