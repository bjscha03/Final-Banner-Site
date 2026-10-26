export type SeasonalCampaignStatus = 'planned' | 'ready' | 'blocked';

export interface CampaignLink {
  label: string;
  href: string;
}

export interface SeasonalMerchandisingCard extends CampaignLink {
  title: string;
  description: string;
  icon: 'school' | 'trophy' | 'store' | 'calendar' | 'map' | 'heart' | 'landmark';
}

export interface HeroArtwork {
  desktopSrc: string;
  desktopAvifSrc?: string;
  desktopWidth: number;
  desktopHeight: number;
  mobileSrc: string;
  mobileAvifSrc?: string;
  mobileWidth: number;
  mobileHeight: number;
  alt: string;
}

export interface HomepageHeroCampaign {
  id: string;
  eyebrow: string;
  headline: string;
  description: string;
  primaryCta: CampaignLink;
  secondaryCta: CampaignLink;
  valueProps: string[];
  artwork?: HeroArtwork;
  merchandising?: SeasonalMerchandisingCard[];
  merchandisingIntro?: {
    eyebrow: string;
    headline: string;
    description: string;
  };
}

export interface SeasonalCampaign extends HomepageHeroCampaign {
  status: SeasonalCampaignStatus;
  tier: 1 | 2 | 3;
  priority: number;
  startDate: string;
  endDate: string;
}

export const CAMPAIGN_TIME_ZONE = 'America/New_York';

export const EVERGREEN_HERO: HomepageHeroCampaign = {
  id: 'evergreen-fast-custom-printing',
  eyebrow: 'Custom printing · Nationwide shipping',
  headline: 'Custom banners and signs that get noticed.',
  description:
    'Choose your product, upload artwork, and review a live print preview before checkout. Most standard orders are produced within 24 hours, followed by free next-day air.',
  primaryCta: { label: 'Start your order', href: '/design' },
  secondaryCta: { label: 'Design your banner', href: '/design?product=banner' },
  valueProps: ['Live print preview', 'Current pricing shown', 'Ships nationwide'],
};

/**
 * Only creatively approved campaigns belong here. The broader planning roadmap
 * lives in docs/marketing/seasonal-campaign-calendar.csv. A future campaign does
 * not become eligible merely because its date arrives: it must explicitly be
 * marked ready and include final desktop/mobile artwork.
 */
export const SEASONAL_CAMPAIGNS: SeasonalCampaign[] = [
  {
    id: 'back-to-school-fall-kickoff-2026',
    status: 'ready',
    tier: 1,
    priority: 100,
    startDate: '2026-08-07',
    endDate: '2026-08-24',
    eyebrow: 'Back to school · Open houses · Fall events',
    headline: 'Make the first day impossible to miss.',
    description:
      'Welcome students, promote open houses, and get fall events ready with custom banners. Most standard orders are produced within 24 hours, followed by free next-day air.',
    primaryCta: { label: 'Create a school banner', href: '/design' },
    secondaryCta: { label: 'Design your banner', href: '/design?product=banner' },
    valueProps: ['24-hour standard production', 'Free next-day air after production', 'Live print preview'],
    artwork: {
      desktopSrc: '/images/homepage/school-hero-desktop.webp',
      desktopAvifSrc: '/images/homepage/school-hero-desktop.avif',
      desktopWidth: 1127,
      desktopHeight: 657,
      mobileSrc: '/images/homepage/school-hero-mobile.webp',
      mobileAvifSrc: '/images/homepage/school-hero-mobile.avif',
      mobileWidth: 700,
      mobileHeight: 657,
      alt: 'Ridgeview Academy welcome back vinyl banner professionally mounted on a school railing',
    },
    merchandising: [
      {
        icon: 'school',
        title: 'First days & open houses',
        description: 'Welcome families, mark registration areas, and make campus directions easy to spot.',
        label: 'Design a welcome banner',
        href: '/design',
      },
      {
        icon: 'trophy',
        title: 'Fall sports & senior night',
        description: 'Create team, sponsor, schedule, and athlete-recognition banners before game day.',
        label: 'Shop vinyl banners',
        href: '/design?product=banner',
      },
      {
        icon: 'store',
        title: 'Labor Day & fall events',
        description: 'Promote sales, festivals, fundraisers, and community events while the season is busy.',
        label: 'Start an event banner',
        href: '/design',
      },
    ],
  },
  {
    id: 'halloween-events-2026',
    status: 'ready',
    tier: 2,
    priority: 90,
    startDate: '2026-08-25',
    endDate: '2026-10-31',
    eyebrow: 'Made for your next big moment',
    headline: 'Make every fall event easy to find.',
    description:
      'Beautiful custom banners, printed in 24 hours. Free Next-Day Air shipping on orders $20+.',
    primaryCta: { label: 'Design your banner', href: '/design' },
    secondaryCta: { label: 'Design your banner', href: '/design?product=banner' },
    valueProps: ['24-hour standard production', 'Free next-day air after production', 'Live print preview'],
    artwork: {
      desktopSrc: '/images/homepage/freshfield-fall-desktop.webp',
      desktopAvifSrc: '/images/homepage/freshfield-fall-desktop.avif',
      desktopWidth: 1536,
      desktopHeight: 1024,
      mobileSrc: '/images/homepage/freshfield-fall-mobile.webp',
      mobileAvifSrc: '/images/homepage/freshfield-fall-mobile.avif',
      mobileWidth: 900,
      mobileHeight: 600,
      alt: 'Cream and forest-green Freshfield Fall Market vinyl banner with reinforced hems and silver grommets, mounted between timber posts in natural daylight',
    },
    merchandising: [
      {
        icon: 'calendar',
        title: 'Trunk-or-treat & fall festivals',
        description: 'Put the event name, date, and time where families can read them before they arrive.',
        label: 'Create an event banner',
        href: '/design',
      },
      {
        icon: 'map',
        title: 'Parking & event directions',
        description: 'Use matching yard signs to guide cars, mark entrances, and keep activity areas clear.',
        label: 'Shop yard signs',
        href: '/design?product=yard-signs',
      },
      {
        icon: 'store',
        title: 'October business promotions',
        description: 'Make seasonal sales, attractions, and special hours visible from the street.',
        label: 'Design your banner',
        href: '/design?product=banner',
      },
    ],
  },
  {
    id: 'veterans-day-recognition-2026',
    status: 'ready',
    tier: 2,
    priority: 89,
    startDate: '2026-10-12',
    endDate: '2026-11-11',
    eyebrow: 'Veterans Day · Ceremonies · Community recognition',
    headline: 'Create a tribute your community can see.',
    description:
      'Honor those who served at schools, ceremonies, parades, and community gatherings with clear, respectful custom signage.',
    primaryCta: { label: 'Create a recognition banner', href: '/design' },
    secondaryCta: { label: 'Design your banner', href: '/design?product=banner' },
    valueProps: ['24-hour standard production', 'Free next-day air after production', 'Live print preview'],
    artwork: {
      desktopSrc: '/images/seasonal-veterans-day-2026-desktop.webp',
      desktopWidth: 1400,
      desktopHeight: 875,
      mobileSrc: '/images/seasonal-veterans-day-2026-mobile.webp',
      mobileWidth: 900,
      mobileHeight: 1125,
      alt: 'Cedar Grove Veterans Council recognition banner securely mounted at a civic ceremony',
    },
    merchandising: [
      {
        icon: 'landmark',
        title: 'Ceremonies & parades',
        description: 'Create a dignified focal banner for municipal observances, assemblies, and parade routes.',
        label: 'Design a ceremony banner',
        href: '/design',
      },
      {
        icon: 'heart',
        title: 'School & community tributes',
        description: 'Recognize service with readable welcome, appreciation, and event banners.',
        label: 'Shop vinyl banners',
        href: '/design?product=banner',
      },
      {
        icon: 'map',
        title: 'Arrival & viewing directions',
        description: 'Mark parking, entrances, ceremony areas, and route changes with matching yard signs.',
        label: 'Shop yard signs',
        href: '/design?product=yard-signs',
      },
    ],
  },
  {
    id: 'thanksgiving-community-2026',
    status: 'ready',
    tier: 2,
    priority: 88,
    startDate: '2026-10-19',
    endDate: '2026-11-26',
    eyebrow: 'Food drives · Community dinners · Fall events',
    headline: 'Turn community support into a visible invitation.',
    description:
      'Promote collection dates, welcome guests, and guide volunteers with custom banners and signs made for busy community events.',
    primaryCta: { label: 'Create Thanksgiving signage', href: '/design' },
    secondaryCta: { label: 'Shop yard signs', href: '/design?product=yard-signs' },
    valueProps: ['24-hour standard production', 'Free next-day air after production', 'Live print preview'],
    artwork: {
      desktopSrc: '/images/seasonal-thanksgiving-2026-desktop.webp',
      desktopWidth: 1400,
      desktopHeight: 875,
      mobileSrc: '/images/seasonal-thanksgiving-2026-mobile.webp',
      mobileWidth: 900,
      mobileHeight: 1125,
      alt: 'Harvest Bridge Food Pantry community food drive banner mounted outside a donation center',
    },
    merchandising: [
      {
        icon: 'heart',
        title: 'Food & coat drives',
        description: 'Show what to donate, when collections end, and where neighbors should bring items.',
        label: 'Create a drive banner',
        href: '/design',
      },
      {
        icon: 'map',
        title: 'Community dinner directions',
        description: 'Guide guests, volunteers, and deliveries with clear entrance and parking signs.',
        label: 'Shop yard signs',
        href: '/design?product=yard-signs',
      },
      {
        icon: 'store',
        title: 'Seasonal business messages',
        description: 'Promote holiday hours, pickup areas, catering, and fall offers before Thanksgiving week.',
        label: 'Design your banner',
        href: '/design?product=banner',
      },
    ],
  },
  {
    id: 'holiday-sales-2026',
    status: 'ready',
    tier: 1,
    priority: 95,
    startDate: '2026-11-02',
    endDate: '2026-11-30',
    eyebrow: 'Holiday weekend · Storefront sales · Pickup signage',
    headline: 'Make your holiday offer impossible to miss.',
    description:
      'Bring Black Friday and holiday-weekend offers to the street with clear custom banners and directional signs.',
    primaryCta: { label: 'Create a holiday sale banner', href: '/design' },
    secondaryCta: { label: 'Design your banner', href: '/design?product=banner' },
    valueProps: ['24-hour standard production', 'Free next-day air after production', 'Live print preview'],
    artwork: {
      desktopSrc: '/images/seasonal-holiday-sales-2026-desktop.webp',
      desktopWidth: 1400,
      desktopHeight: 875,
      mobileSrc: '/images/seasonal-holiday-sales-2026-mobile.webp',
      mobileWidth: 900,
      mobileHeight: 1125,
      alt: 'Northline Outdoor Goods Holiday Weekend Sale vinyl banner securely mounted to a storefront railing',
    },
    merchandising: [
      {
        icon: 'store',
        title: 'Storefront sale banners',
        description: 'Lead with one verified offer and clear dates so passing shoppers understand it at a glance.',
        label: 'Create a sale banner',
        href: '/design',
      },
      {
        icon: 'map',
        title: 'Pickup & entrance directions',
        description: 'Guide online orders and holiday traffic with matching entrance, curbside, and pickup signs.',
        label: 'Shop yard signs',
        href: '/design?product=yard-signs',
      },
      {
        icon: 'calendar',
        title: 'Plan every changeover',
        description: 'Sequence weekend offers, gift deadlines, and clearance messages so expired signage comes down on time.',
        label: 'Read the retail guide',
        href: '/blog/holiday-retail-sale-banners',
      },
    ],
  },

  {
    id: 'holiday-events-2026',
    status: 'ready',
    tier: 1,
    priority: 94,
    startDate: '2026-11-15',
    endDate: '2026-12-23',
    eyebrow: 'Christmas events · Holiday programs · Winter promotions',
    headline: 'Bring every holiday gathering into view.',
    description:
      'Welcome guests, share event times, and guide holiday traffic with bright custom banners and yard signs.',
    primaryCta: { label: 'Design holiday signage', href: '/design?product=banner' },
    secondaryCta: { label: 'Design your banner', href: '/design?product=banner' },
    valueProps: ['24-hour standard production', 'Free next-day air after production', 'Live print preview'],
    artwork: {
      desktopSrc: '/images/seasonal-holiday-events-2026-desktop.webp',
      desktopWidth: 1400,
      desktopHeight: 875,
      mobileSrc: '/images/seasonal-holiday-events-2026-mobile.webp',
      mobileWidth: 900,
      mobileHeight: 1125,
      alt: 'Cedar and Bell Community Arts Center Winter Lights Festival vinyl banner securely mounted to an outdoor railing',
    },
    merchandising: [
      {
        icon: 'calendar',
        title: 'Festivals & holiday programs',
        description: 'Put the event name, date, and time where guests can understand the plan before they arrive.',
        label: 'Create an event banner',
        href: '/design?product=banner',
      },
      {
        icon: 'heart',
        title: 'Services, concerts & school events',
        description: 'Share schedules and welcoming messages with signage designed to stay readable from the street.',
        label: 'Design your banner',
        href: '/design?product=banner',
      },
      {
        icon: 'map',
        title: 'Parking, entrances & pickup',
        description: 'Guide guests, deliveries, and seasonal traffic with matching entrance and directional yard signs.',
        label: 'Shop yard signs',
        href: '/design?product=yard-signs',
      },
    ],
  },
  {
    id: 'new-year-2027',
    status: 'ready',
    tier: 2,
    priority: 93,
    startDate: '2026-12-14',
    endDate: '2027-01-02',
    eyebrow: "New Year's Eve · Year-end sales · January openings",
    headline: 'Make the final celebration impossible to miss.',
    description:
      "Promote New Year's events, year-end offers, and January openings with custom banners and yard signs made fast.",
    primaryCta: { label: "Create a New Year's banner", href: '/design?product=banner' },
    secondaryCta: { label: 'Design your banner', href: '/design?product=banner' },
    valueProps: ['24-hour standard production', 'Free next-day air after production', 'Live print preview'],
    artwork: {
      desktopSrc: '/images/seasonal-new-year-2027-desktop.webp',
      desktopWidth: 1400,
      desktopHeight: 875,
      mobileSrc: '/images/seasonal-new-year-2027-mobile.webp',
      mobileWidth: 900,
      mobileHeight: 1125,
      alt: "Northline Social Hall New Year's Eve vinyl banner securely mounted to a terrace railing",
    },
    merchandising: [
      {
        icon: 'calendar',
        title: "New Year's Eve events",
        description: 'Lead with the event name, date, and time so guests can understand the plan at a glance.',
        label: 'Create an event banner',
        href: '/design?product=banner',
      },
      {
        icon: 'store',
        title: 'Year-end sales & clearances',
        description: 'Make one offer and its deadline readable from the street before the calendar turns.',
        label: 'Design your banner',
        href: '/design?product=banner',
      },
      {
        icon: 'map',
        title: 'Entrances, parking & pickup',
        description: 'Guide celebration traffic and holiday orders with matching directional yard signs.',
        label: 'Shop yard signs',
        href: '/design?product=yard-signs',
      },
    ],
  },
  {
    id: 'business-refresh-2027',
    status: 'ready',
    tier: 1,
    priority: 97,
    startDate: '2027-01-02',
    endDate: '2027-02-15',
    eyebrow: 'New year planning · Now hiring · Business visibility',
    headline: 'Put your next move where customers can see it.',
    description:
      'Promote hiring, new services, and a fresh start with custom banners, yard signs, and car magnets made fast.',
    primaryCta: { label: 'Refresh your business signage', href: '/design?product=banner' },
    secondaryCta: { label: 'Design your banner', href: '/design?product=banner' },
    valueProps: ['24-hour standard production', 'Free next-day air after production', 'Live print preview'],
    artwork: {
      desktopSrc: '/images/seasonal-business-refresh-2027-desktop.webp',
      desktopWidth: 1400,
      desktopHeight: 875,
      mobileSrc: '/images/seasonal-business-refresh-2027-mobile.webp',
      mobileWidth: 900,
      mobileHeight: 1125,
      alt: 'Summit and Pine Home Services Now Hiring vinyl banner secured to a snowy workshop fence with reinforced hems, grommets, and ties',
    },
    merchandisingIntro: {
      eyebrow: 'Built for January visibility',
      headline: 'Make the new year visible.',
      description: 'Hiring, service, storefront, and vehicle ideas for businesses ready to be seen.',
    },
    merchandising: [
      {
        icon: 'store',
        title: 'Now hiring & recruiting',
        description: 'Lead with one role and a short application action so candidates can respond at a glance.',
        label: 'Create a hiring banner',
        href: '/design?product=banner',
      },
      {
        icon: 'calendar',
        title: 'New services & fresh offers',
        description: 'Make January openings, service updates, and seasonal promotions readable from the street.',
        label: 'Design a business banner',
        href: '/design?product=banner',
      },
      {
        icon: 'map',
        title: 'Vehicles & jobsite visibility',
        description: 'Carry a consistent business identity from the storefront to service vehicles and active jobsites.',
        label: 'Shop car magnets',
        href: '/design?product=car-magnets',
      },
    ],
  },
  {
    id: 'winter-trade-shows-2027',
    status: 'ready',
    tier: 1,
    priority: 96,
    startDate: '2027-01-04',
    endDate: '2027-04-30',
    eyebrow: 'Winter shows · Spring expos · Conference season',
    headline: 'Make your booth readable before the aisle gets busy.',
    description:
      'Build a clear booth message with custom vinyl banners sized for tables, back walls, and busy exhibit aisles.',
    primaryCta: { label: 'Prepare your booth banner', href: '/design?product=banner' },
    secondaryCta: { label: 'Design your banner', href: '/design?product=banner' },
    valueProps: ['24-hour standard production', 'Free next-day air after production', 'Live print preview'],
    artwork: {
      desktopSrc: '/images/seasonal-winter-trade-shows-2027-desktop.webp',
      desktopWidth: 1400,
      desktopHeight: 875,
      mobileSrc: '/images/seasonal-winter-trade-shows-2027-mobile.webp',
      mobileWidth: 900,
      mobileHeight: 1125,
      alt: 'Northstar Process Labs trade show booth with a finished table-front vinyl banner and coordinated backdrop',
    },
    merchandisingIntro: {
      eyebrow: 'Built for busy show floors',
      headline: 'Plan the booth before the aisle fills.',
      description: 'Table-front, backdrop, and deadline guidance for winter and spring exhibitors.',
    },
    merchandising: [
      {
        icon: 'store',
        title: 'Table-front booth banners',
        description: 'Keep the company name and core offer visible even when staff and visitors fill the booth.',
        label: 'Create a booth banner',
        href: '/design?product=banner',
      },
      {
        icon: 'landmark',
        title: 'Back walls & aisle visibility',
        description: 'Use a focused message and bold identity that can be understood from across the exhibit hall.',
        label: 'Design your backdrop',
        href: '/design?product=banner',
      },
      {
        icon: 'calendar',
        title: 'Plan the show deadline',
        description: 'Confirm booth measurements, hardware, proof timing, and delivery dates before freight cutoff.',
        label: 'Read the trade show checklist',
        href: '/blog/trade-show-banner-checklist',
      },
    ],
  },
  {
    id: 'mardi-gras-2027',
    status: 'ready',
    tier: 2,
    priority: 92,
    startDate: '2027-01-04',
    endDate: '2027-02-09',
    eyebrow: 'Mardi Gras · Parades · Community events',
    headline: 'Bring the celebration into full view.',
    description:
      'Promote parade times, venue events, and guest directions with bright custom banners and matching yard signs.',
    primaryCta: { label: 'Create Mardi Gras signage', href: '/design?product=banner' },
    secondaryCta: { label: 'Shop yard signs', href: '/design?product=yard-signs' },
    valueProps: ['24-hour standard production', 'Free next-day air after production', 'Live print preview'],
    artwork: {
      desktopSrc: '/images/seasonal-mardi-gras-2027-desktop.webp',
      desktopWidth: 1400,
      desktopHeight: 875,
      mobileSrc: '/images/seasonal-mardi-gras-2027-mobile.webp',
      mobileWidth: 900,
      mobileHeight: 1125,
      alt: 'Crescent Grove Mardi Gras Family Parade vinyl banner mounted securely to a street barricade with reinforced hems, grommets, and ties',
    },
    merchandisingIntro: {
      eyebrow: 'Built for parade season',
      headline: 'Turn celebration details into a clear invitation.',
      description: 'Event, venue, and directional signage ideas for Mardi Gras crowds.',
    },
    merchandising: [
      {
        icon: 'calendar',
        title: 'Parades & family events',
        description: 'Put the event name, date, and time where spectators can understand the invitation quickly.',
        label: 'Create a parade banner',
        href: '/design?product=banner',
      },
      {
        icon: 'store',
        title: 'Restaurants, bars & venues',
        description: 'Promote celebration hours, live music, menus, and entry details with one clear street-facing message.',
        label: 'Design an event banner',
        href: '/design?product=banner',
      },
      {
        icon: 'map',
        title: 'Parking & guest directions',
        description: 'Guide arrivals around closures, entrances, pickup areas, and family activity zones.',
        label: 'Shop yard signs',
        href: '/design?product=yard-signs',
      },
    ],
  },
  {
    id: 'school-registration-2027',
    status: 'ready',
    tier: 2,
    priority: 91,
    startDate: '2027-01-04',
    endDate: '2027-04-01',
    eyebrow: 'Registration · Open houses · Enrollment',
    headline: 'Make every family’s next step easy to find.',
    description:
      'Promote enrollment dates, welcome families, and guide campus traffic with bright custom banners and yard signs.',
    primaryCta: { label: 'Create enrollment signage', href: '/design?product=banner' },
    secondaryCta: { label: 'Shop yard signs', href: '/design?product=yard-signs' },
    valueProps: ['24-hour standard production', 'Free next-day air after production', 'Live print preview'],
    artwork: {
      desktopSrc: '/images/seasonal-school-registration-2027-desktop.webp',
      desktopWidth: 1400,
      desktopHeight: 875,
      mobileSrc: '/images/seasonal-school-registration-2027-mobile.webp',
      mobileWidth: 900,
      mobileHeight: 1125,
      alt: 'Redbud Academy Spring Open House and enrollment vinyl banner mounted to a campus fence with reinforced hems, grommets, and ties',
    },
    merchandisingIntro: {
      eyebrow: 'Built for enrollment season',
      headline: 'Guide families from the street to check-in.',
      description: 'Open house, deadline, and campus wayfinding ideas for registration season.',
    },
    merchandising: [
      {
        icon: 'school',
        title: 'Open houses & campus tours',
        description: 'Welcome prospective families with a readable event date, arrival point, and next action.',
        label: 'Create an open house banner',
        href: '/design?product=banner',
      },
      {
        icon: 'calendar',
        title: 'Enrollment deadlines',
        description: 'Keep application and registration dates visible before families reach the front office.',
        label: 'Design enrollment signage',
        href: '/design?product=banner',
      },
      {
        icon: 'map',
        title: 'Parking, check-in & directions',
        description: 'Guide visitors from the street to visitor parking, check-in tables, and tour entrances.',
        label: 'Shop yard signs',
        href: '/design?product=yard-signs',
      },
    ],
  },
];

export function getCampaignDateIso(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CAMPAIGN_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function getActiveSeasonalCampaignForDate(dateIso: string): SeasonalCampaign | null {
  return SEASONAL_CAMPAIGNS
    .filter((campaign) =>
      campaign.status === 'ready'
      && Boolean(campaign.artwork)
      && campaign.startDate <= dateIso
      && campaign.endDate >= dateIso)
    // When roadmap windows overlap, feature the campaign that expires first so
    // the homepage follows the nearest customer deadline, then hand off
    // automatically to the next still-active campaign.
    .sort((a, b) => a.endDate.localeCompare(b.endDate) || b.priority - a.priority)[0] ?? null;
}

export function getActiveSeasonalCampaign(date = new Date()): SeasonalCampaign | null {
  return getActiveSeasonalCampaignForDate(getCampaignDateIso(date));
}

export function getHomepageHeroCampaign(date = new Date()): HomepageHeroCampaign {
  return getActiveSeasonalCampaign(date) ?? EVERGREEN_HERO;
}
