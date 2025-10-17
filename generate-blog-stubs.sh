#!/bin/bash

# Create content/blog directory if it doesn't exist
mkdir -p content/blog

# Array of blog post data (slug|title|date|tags|keyword|intent)
posts=(
  "trade-show-banner-sizes-guide|Best Banner Sizes for 10×10 and 10×20 Trade Show Booths|2025-10-22|Trade Shows,Sizing,Events|trade show banner sizes|Informational"
  "print-ready-banner-artwork-guide|How to Prepare Print-Ready Artwork for Vinyl Banners|2025-10-24|Design,How-To,Artwork|print ready banner artwork|Informational"
  "fence-banners-design-permitting-guide|Fence Banners: Design, Permitting & Wind Load Tips|2025-10-29|Outdoor,Construction,Mesh Banners|fence banners|Informational"
  "grommets-pole-pockets-hemming-guide|Grommets vs Pole Pockets vs Hemming: What to Choose|2025-10-31|Finishing,Installation,How-To|banner grommets vs pole pockets|Informational"
  "real-estate-open-house-banners|Real Estate Open House Banners: Templates & Fast Turnaround|2025-11-03|Real Estate,Templates,Commercial|real estate open house banners|Commercial"
  "trade-show-banner-checklist|Trade Show Banner Checklist: Don't Forget These 9 Things|2025-11-05|Trade Shows,Checklist,Events|trade show banner checklist|Informational"
  "color-accuracy-cmyk-banners|Color Accuracy for CMYK Banners (Without a Designer)|2025-11-07|Design,Color,Technical|cmyk banner color accuracy|Informational"
  "school-sports-event-banners|Event Banners for Schools & Sports: Schedules, Seniors, Sponsors|2025-11-10|Schools,Sports,Events|school sports banners|Commercial"
  "outdoor-banner-durability-guide|Outdoor Banner Durability: Materials, UV, and Care|2025-11-12|Outdoor,Durability,Materials|outdoor banner durability|Informational"
  "banner-design-readability-tips|Design Tips: Readable From 10, 20, 50 Feet|2025-11-14|Design,Typography,How-To|banner readability distance|Informational"
  "political-campaign-banners-guide|Political Campaign Banners: Compliance, Sizes & Fast Delivery|2025-11-17|Political,Seasonal,Commercial|political campaign banners|Commercial"
  "holiday-retail-sale-banners|Holiday Retail Banners: Black Friday to New Year Sales|2025-11-19|Retail,Seasonal,Holidays|holiday sale banners|Commercial"
  "grand-opening-banners-guide|Grand Opening Banners: Sizes, Placement & Design Ideas|2025-11-21|Business,Events,Commercial|grand opening banners|Commercial"
  "construction-safety-banners-osha|Safety Banners for Construction Sites: OSHA & Messaging|2025-11-24|Construction,Safety,Outdoor|construction safety banners|Commercial"
  "sponsor-wall-step-repeat-banners|Sponsor Walls & Step-and-Repeat Banners for Events|2025-11-26|Events,Sponsors,Backdrops|step and repeat banners|Commercial"
  "retractable-banner-stands-guide|Retractable Banner Stands: Portable Trade Show Displays|2025-11-28|Trade Shows,Portable,Displays|retractable banner stands|Commercial"
  "church-banners-seasonal-messaging|Church Banners: Easter, Christmas & Year-Round Messaging|2025-12-01|Religious,Seasonal,Indoor|church banners|Commercial"
  "restaurant-banners-menu-boards|Restaurant Banners: Menu Boards, Specials & Outdoor Signage|2025-12-03|Restaurant,Business,Outdoor|restaurant banners|Commercial"
  "birthday-party-custom-banners|Birthday Party Banners: Custom Designs & Fast Shipping|2025-12-05|Personal,Events,Custom|birthday party banners|Commercial"
  "garage-sale-yard-sale-banners|Garage Sale & Yard Sale Banners: Maximize Visibility|2025-12-08|Personal,Outdoor,Directional|garage sale banners|Commercial"
  "nonprofit-fundraiser-banners|Nonprofit & Fundraiser Banners: Awareness & Donor Recognition|2025-12-10|Nonprofit,Events,Fundraising|nonprofit fundraiser banners|Commercial"
  "apartment-property-management-banners|Apartment & Property Management Banners: Leasing & Amenities|2025-12-12|Real Estate,Property,Commercial|apartment leasing banners|Commercial"
)

# Generate MDX stub for each post
for post in "${posts[@]}"; do
  IFS='|' read -r slug title date tags keyword intent <<< "$post"
  
  cat > "content/blog/${slug}.mdx" << EOFMDX
---
title: "${title}"
slug: "${slug}"
publishDate: "${date}"
author: "Banners On The Fly Team"
excerpt: "TODO: Add 150-160 character excerpt optimized for ${keyword}"
tags: [$(echo "$tags" | sed 's/,/", "/g' | sed 's/^/"/' | sed 's/$/"/')]
featured: false
heroImage: "https://res.cloudinary.com/your-cloud/image/upload/v1/blog/${slug}.jpg"
---

# ${title}

**TODO: Write ${intent} content targeting "${keyword}"**

## Introduction

[Hook paragraph - address reader's pain point or question]

## [Section 1 Title]

[Content here]

## [Section 2 Title]

[Content here]

## [Section 3 Title]

[Content here]

## Conclusion

[Summary and CTA]

---

**Related Articles:**
- [The Ultimate Guide to Custom Vinyl Banners](/blog/custom-vinyl-banners-ultimate-guide)
- [Vinyl vs Mesh Banners Guide](/blog/vinyl-vs-mesh-banners-guide)
- [Rush Banner Printing](/blog/24-hour-rush-banner-printing)
EOFMDX

  echo "✅ Created ${slug}.mdx"
done

echo ""
echo "✅ All 22 blog post stubs created!"
