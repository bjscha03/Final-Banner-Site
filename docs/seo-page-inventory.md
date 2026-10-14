# Banners On The Fly — page inventory

Inventory from the current application source and published blog files. Prepared October 14, 2026. Dynamic patterns represent multiple URLs. Redirected pages do not retain their old content.

## Main public pages

| URL | Purpose |
|---|---|
| `/` | Homepage |
| `/design` | Vinyl banner designer |
| `/design?product=yard-signs` | Yard-sign designer |
| `/design?product=car-magnets` | Car-magnet designer |
| `/custom-quote` | Custom quote request |
| `/about` | Company information |
| `/contact` | Contact |
| `/faq` | Frequently asked questions |
| `/shipping` | Production and shipping |
| `/terms` | Terms |
| `/privacy` | Privacy |
| `/blog` | Blog index |
| `/blog/tags/:tag` | Blog topic archives |

## Older public, campaign, referral and diagnostic routes to review

These were retained to avoid breaking existing campaigns, referrals or customer workflows. Paid/utility pages may be intentionally noindex.

- `/google-ads-banner`
- `/large-banners-fast`
- `/fall-festival-banners`
- `/halloween-banner`
- `/louisville-offer`
- `/bof-cash`
- `/bof-cash-test`
- `/refer/:code`
- `/logo-showcase`
- `/pdf-diagnostic`
- `/canva-test`

## Customer account and transaction routes

- `/design/complete`
- `/design/canva-editor`
- `/checkout`
- `/payment-success`
- `/order-confirmation`
- `/my-orders`
- `/my-ai-images`
- `/orders/:id`
- `/sign-in`
- `/sign-up`
- `/forgot-password`
- `/reset-password`
- `/verify-email`
- `/check-email`

## Admin routes

- `/admin/referrals`
- `/admin`
- `/admin/orders`
- `/admin/customers`
- `/admin/blog-leads`
- `/admin/louisville-outreach`
- `/admin/site-issues`
- `/admin/abandoned-carts`
- `/admin/custom-quotes`
- `/admin/email-templates`
- `/admin/email-templates/:slug`
- `/admin/paypal-reconciliation`
- `/admin/setup`
- `/admin/ai-designer`
- `/admin/sales`
- `/admin/seed`
- `/admin/sales/dashboard`
- `/admin/sales/prospects`
- `/admin/sales/lead-review`
- `/admin/sales/activity`
- `/admin/sales/replies`
- `/admin/sales/orders`
- `/admin/sales/performance`
- `/admin/sales/costs`
- `/admin/sales/errors`
- `/admin/sales/settings`

## Redirected legacy pages

| Old URL | Destination |
|---|---|
| `/yard-signs` | `/design?product=yard-signs` |
| `/car-magnets` | `/design?product=car-magnets` |
| `/trade-show-banners` | `/design?product=banner` |
| `/food-truck-banners` | `/design?product=banner` |
| `/outdoor-banners` | `/design?product=banner` |
| `/indoor-banners` | `/design?product=banner` |
| `/event-banners` | `/design?product=banner` |
| `/custom-banners` | `/design?product=banner` |
| `/construction-banners` | `/design?product=banner` |
| `/vinyl-banners` | `/design?product=banner&material=13oz` |
| `/mesh-banners` | `/design?product=banner&material=mesh` |
| `/designer` | `/design?product=banner` |
| `/graduation-signs/*` | `/design?product=banner` |
| `/graduation-signs` | `/design?product=banner` |
| `/proof/*` | `/design?product=banner` |
| `/design-editor` | `/design` (client redirect) |
| `/double-sided-banners` | Banner designer with double-sided configuration, via existing redirect function |

## Permanently removed political pages

These URL families return HTTP 410, including trailing slashes and query strings. Political source articles were removed from the blog loader and sitemap. Search engines remove previously indexed results after recrawling; historical third-party caches cannot be erased by a site deploy.

- `/political-signs`
- `/blog/political-sign-disclaimer-requirements`
- `/blog/political-campaign-banners-guide` (previously a draft)

## Retired namespaces

- `/vinyl-banners/*`, `/yard-signs/*`, `/car-magnets/*`: old city pages return 404.
- `/trade-shows` and `/trade-shows/*`: return 404.
- Unknown application URLs outside existing route patterns return 404.

## Published blog articles (74)

Existing non-political article content was retained, apart from removing one link to a retired political article.

| Title | URL |
|---|---|
| 13 oz vs. 15 oz vs. 18 oz Vinyl Banners: Which Should You Choose? | `/blog/13oz-vs-15oz-vs-18oz-vinyl-banner-guide` |
| Apartment Leasing Banners: A Property Manager’s Planning Guide | `/blog/apartment-property-management-banners` |
| Are Vinyl Banners Waterproof? A Practical Rain and Care Guide | `/blog/are-vinyl-banners-waterproof` |
| Back-to-School Banners: A Planning Guide for Welcome, Wayfinding & Events | `/blog/back-to-school-banners-guide` |
| How to Make a Banner Readable From 10, 20, or 50 Feet | `/blog/banner-design-readability-tips` |
| Banner Grommet Spacing Guide: How Far Apart Should Grommets Be? | `/blog/banner-grommet-spacing-guide` |
| Installation 101: The Best Ways to Hang Your Vinyl Banner for Maximum Visibility and Longevity | `/blog/banner-installation-hanging-guide` |
| Banner Pole Pocket Size Guide: Measure the Pole Before You Order | `/blog/banner-pole-pocket-size-guide` |
| What Resolution Should a Banner Be? A DPI and Pixel-Size Guide | `/blog/banner-resolution-dpi-pixel-size-guide` |
| Banner Safe Area and Bleed: Keep Text Clear of Hems and Grommets | `/blog/banner-safe-area-bleed-guide` |
| What Size Banner Fits a 10×10 Canopy? A Vendor Setup Guide | `/blog/banner-size-for-10x10-canopy` |
| What Size Banner Fits a 6-Foot Table? A Practical Measuring Guide | `/blog/banner-size-for-6-foot-table` |
| Banner vs. Yard Sign: Which Format Fits Your Message? | `/blog/banner-vs-yard-sign` |
| Banner Wind Slits: Do They Work—or Weaken the Banner? | `/blog/banner-wind-slits-guide` |
| What Size Birthday Banner Do I Need? A Venue-by-Venue Guide | `/blog/birthday-banner-size-guide` |
| Can Vinyl Banners Be Recycled? A Reuse and Disposal Guide | `/blog/can-vinyl-banners-be-recycled` |
| Car Magnet Design Guide: What to Include and What to Leave Out | `/blog/car-magnet-design-guide` |
| Car Magnet Size Guide: Choose the Right Fit for Your Vehicle | `/blog/car-magnet-size-guide` |
| Car Magnets vs. Vinyl Decals: Which Is Better for Your Vehicle? | `/blog/car-magnets-vs-vinyl-decals` |
| Church Banner Ideas: A Practical Guide for Welcome, Events & Seasons | `/blog/church-banner-ideas` |
| CMYK Banner Printing: How to Get More Predictable Color | `/blog/color-accuracy-cmyk-banners` |
| Construction Safety Banners: Jobsite Messaging & Placement Guide | `/blog/construction-safety-banners-osha` |
| Custom Yard Signs Near Me: Fast Printing & Free Next-Day Shipping (2026 Guide) | `/blog/custom-yard-signs-near-me` |
| From Flea Markets to Food Festivals: How Dano's Seasoning Grew with the Right Banners | `/blog/danos-seasoning-banner-success-story` |
| How to Design a Banner in Canva for Printing: A File Setup Checklist | `/blog/design-banner-in-canva-for-print` |
| Do Car Magnets Damage Paint? A Safer Care and Inspection Guide | `/blog/do-car-magnets-damage-paint` |
| Farmers Market Banner Ideas: Build a Clear Booth Signage Plan | `/blog/farmers-market-banner-ideas` |
| Fence Banners: How to Measure, Design, and Hang Them Securely | `/blog/fence-banners-design-permitting-guide` |
| Finish Line Banner Size Guide: Plan the Chute, Sponsors, and Setup | `/blog/finish-line-banner-size-guide` |
| Garage Sale Banner Ideas: Wording, Placement, and Directional Signs | `/blog/garage-sale-yard-sale-banners` |
| Grand Opening Banner Ideas: A Complete Planning & Design Guide | `/blog/grand-opening-banner-ideas` |
| Banner Grommets vs. Pole Pockets vs. Rope: Which Finish Should You Choose? | `/blog/grommets-pole-pockets-hemming-guide` |
| Halloween Banner Ideas That Help Guests Find and Enjoy Your Event | `/blog/halloween-banner-ideas` |
| Holiday Sale Banners: A Retail Planning and Design Guide | `/blog/holiday-retail-sale-banners` |
| Horizontal vs. Vertical Banners: How to Choose Orientation | `/blog/horizontal-vs-vertical-banner` |
| How Long Do Yard Signs Last? A Weather and Reuse Guide | `/blog/how-long-do-yard-signs-last` |
| How Many Yard Signs Should I Order? A Location-First Planning Guide | `/blog/how-many-yard-signs-should-i-order` |
| How to Clean a Vinyl Banner Without Damaging the Print | `/blog/how-to-clean-vinyl-banner` |
| How to Create a Custom Vinyl Banner with AI | `/blog/how-to-create-vinyl-banner-with-ai` |
| How to Hang a Banner on a Brick Wall: Four Safer Options | `/blog/how-to-hang-banner-on-brick-wall` |
| How to Hang a Banner on a Canopy Tent: A Safer Setup Guide | `/blog/how-to-hang-banner-on-canopy-tent` |
| How to Hang a Banner on a Table: Clips, Grommets, and Setup | `/blog/how-to-hang-banner-on-table` |
| How to Hang a Banner Without Grommets: Five Practical Methods | `/blog/how-to-hang-banner-without-grommets` |
| How to Install Yard Sign Stakes: A Step-by-Step Guide | `/blog/how-to-install-yard-sign-stakes` |
| How to Repair a Vinyl Banner: Tears, Edges, and Grommets | `/blog/how-to-repair-vinyl-banner` |
| How to Store Vinyl Banners Without Creases or Damage | `/blog/how-to-store-vinyl-banners` |
| How to Keep Car Magnets From Falling Off: Installation & Care | `/blog/keep-car-magnets-from-falling-off` |
| Fundraiser Banner Ideas: Sponsorship, Wayfinding & Event Signage | `/blog/nonprofit-fundraiser-banners` |
| Now Hiring Banner Ideas: What to Say and How to Design It | `/blog/now-hiring-banner-ideas` |
| How Long Do Outdoor Banners Last? A Durability and Care Guide | `/blog/outdoor-banner-durability-guide` |
| Parade Banner Size Guide: Plan the Message, Carriers, and Hardware | `/blog/parade-banner-size-guide` |
| How to Choose the Perfect Banner Size for Your Event or Business | `/blog/perfect-banner-size-guide` |
| Print-Ready Banner Artwork: The Complete File Setup Checklist | `/blog/print-ready-banner-artwork-guide` |
| QR Codes on Banners: Size, Placement, and Scan-Test Guide | `/blog/qr-code-on-banner-guide` |
| Open House Banners and Yard Signs: A Complete Planning Guide | `/blog/real-estate-open-house-banners` |
| How to Remove Wrinkles From a Vinyl Banner Without Damaging It | `/blog/remove-wrinkles-vinyl-banner` |
| Restaurant Banner Ideas: Menu Boards, Specials & Outdoor Signage | `/blog/restaurant-banners-menu-boards` |
| School Sports Banners: A Complete Guide for Senior Night, Sponsors & Game Day | `/blog/school-sports-event-banners` |
| Senior Night Banner Size Guide: Measure Rails, Photos, and Team Sets | `/blog/senior-night-banner-size-guide` |
| Single-Sided vs. Double-Sided Yard Signs: Which Should You Choose? | `/blog/single-vs-double-sided-yard-signs` |
| Standard Yard Sign Size: Is 24×18 Inches Right? | `/blog/standard-yard-sign-size-guide` |
| Step-and-Repeat Banner Size Guide: Plan a Better Photo Backdrop | `/blog/step-and-repeat-banner-size-guide` |
| Storefront Banner Size Guide: Measure Before You Order | `/blog/storefront-banner-size-guide` |
| Trade Show Booth Checklist: Plan Banners, Setup, and Backup Gear | `/blog/trade-show-banner-checklist` |
| Trade Show Banner Sizes: A Practical Guide for 10×10 and 10×20 Booths | `/blog/trade-show-banner-sizes-guide` |
| How Much Does a Vinyl Banner Cost? A Practical Pricing Guide | `/blog/vinyl-banner-cost-guide` |
| Vinyl Banner Weight Calculator: Estimate Weight by Size and Material | `/blog/vinyl-banner-weight-calculator` |
| Vinyl vs. Fabric Banners: Which Material Fits Your Display? | `/blog/vinyl-vs-fabric-banners` |
| Vinyl vs. Mesh Banners: Which Is Better for Your Next Project? | `/blog/vinyl-vs-mesh-banners-guide` |
| Wedding Banner Size Guide: Welcome Signs, Backdrops, and Reception Displays | `/blog/wedding-banner-size-guide` |
| What Are Vinyl Banners Made Of? Scrim, PVC, and Weight Explained | `/blog/what-are-vinyl-banners-made-of` |
| What Are Yard Signs Made Of? Corrugated Plastic Explained | `/blog/what-are-yard-signs-made-of` |
| Will Car Magnets Stick to Your Vehicle? Test Before You Order | `/blog/will-car-magnets-stick-to-my-car` |
| Yard Sign Design Guide: Create a 24×18 Sign People Can Read | `/blog/yard-sign-design-guide` |

## Standalone public HTML files to review

These files exist outside React routing and can remain directly reachable. No removal was authorized for non-political files.

- `/admin-customer-repair.html`
- `/clear-cart.html`
- `/clear-checkout-context.html`
- `/clear-storage.html`
- `/debug-cart.html`
- `/gone.html`
