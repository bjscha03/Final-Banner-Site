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
  secondaryCta: { label: 'Compare products & pricing', href: '/vinyl-banners' },
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
    endDate: '2026-09-07',
    eyebrow: 'Back to school · Open houses · Fall events',
    headline: 'Make the first day impossible to miss.',
    description:
      'Welcome students, promote open houses, and get fall events ready with custom banners. Most standard orders are produced within 24 hours, followed by free next-day air.',
    primaryCta: { label: 'Create a school banner', href: '/design' },
    secondaryCta: { label: 'Explore vinyl banners', href: '/vinyl-banners' },
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
        href: '/vinyl-banners',
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
    startDate: '2026-09-21',
    endDate: '2026-10-31',
    eyebrow: 'Halloween events · Trunk-or-treat · Fall promotions',
    headline: 'Make every fall event easy to find.',
    description:
      'Welcome families, guide traffic, and promote October events with bright custom banners and yard signs.',
    primaryCta: { label: 'Design Halloween signage', href: '/design' },
    secondaryCta: { label: 'Explore vinyl banners', href: '/vinyl-banners' },
    valueProps: ['24-hour standard production', 'Free next-day air after production', 'Live print preview'],
    artwork: {
      desktopSrc: '/images/seasonal-halloween-2026-desktop.webp',
      desktopWidth: 1400,
      desktopHeight: 875,
      mobileSrc: '/images/seasonal-halloween-2026-mobile.webp',
      mobileWidth: 900,
      mobileHeight: 1125,
      alt: 'Maple Hollow Community Center trunk-or-treat vinyl banner mounted to an outdoor railing',
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
        href: '/yard-signs',
      },
      {
        icon: 'store',
        title: 'October business promotions',
        description: 'Make seasonal sales, attractions, and special hours visible from the street.',
        label: 'Explore vinyl banners',
        href: '/vinyl-banners',
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
    secondaryCta: { label: 'Explore vinyl banners', href: '/vinyl-banners' },
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
        href: '/vinyl-banners',
      },
      {
        icon: 'map',
        title: 'Arrival & viewing directions',
        description: 'Mark parking, entrances, ceremony areas, and route changes with matching yard signs.',
        label: 'Shop yard signs',
        href: '/yard-signs',
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
    secondaryCta: { label: 'Shop yard signs', href: '/yard-signs' },
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
        href: '/yard-signs',
      },
      {
        icon: 'store',
        title: 'Seasonal business messages',
        description: 'Promote holiday hours, pickup areas, catering, and fall offers before Thanksgiving week.',
        label: 'Explore vinyl banners',
        href: '/vinyl-banners',
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
    secondaryCta: { label: 'Explore vinyl banners', href: '/vinyl-banners' },
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
        href: '/yard-signs',
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
