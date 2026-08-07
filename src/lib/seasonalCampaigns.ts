export type SeasonalCampaignStatus = 'planned' | 'ready' | 'blocked';

export interface CampaignLink {
  label: string;
  href: string;
}

export interface SeasonalMerchandisingCard extends CampaignLink {
  title: string;
  description: string;
  icon: 'school' | 'trophy' | 'store';
}

export interface HeroArtwork {
  desktopSrc: string;
  desktopWidth: number;
  desktopHeight: number;
  mobileSrc: string;
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
      desktopSrc: '/images/seasonal-back-to-school-2026-desktop.webp',
      desktopWidth: 1400,
      desktopHeight: 876,
      mobileSrc: '/images/seasonal-back-to-school-2026-mobile.webp',
      mobileWidth: 900,
      mobileHeight: 1125,
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
    .sort((a, b) => b.priority - a.priority)[0] ?? null;
}

export function getActiveSeasonalCampaign(date = new Date()): SeasonalCampaign | null {
  return getActiveSeasonalCampaignForDate(getCampaignDateIso(date));
}

export function getHomepageHeroCampaign(date = new Date()): HomepageHeroCampaign {
  return getActiveSeasonalCampaign(date) ?? EVERGREEN_HERO;
}
