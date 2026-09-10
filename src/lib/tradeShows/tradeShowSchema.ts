import { getBreadcrumbSchema, getFAQSchema, getWebPageSchema } from '@/components/SEO';
import { getTradeShowFaqs, getTradeShowPageContent } from './tradeShowContent';
import {
  TRADE_SHOWS,
  getTradeShowPath,
  isIndexableTradeShow,
  type TradeShow,
} from './tradeShows';

const SITE_URL = 'https://bannersonthefly.com';

export function buildTradeShowDirectorySchema(description: string): object[] {
  const path = '/trade-shows';
  return [
    getWebPageSchema({
      name: 'August 2026 U.S. Trade Show Calendar',
      description,
      url: path,
    }),
    getBreadcrumbSchema([
      { name: 'Home', url: '/' },
      { name: 'Trade Shows', url: path },
    ]),
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'August 2026 U.S. Trade Show Calendar',
      description,
      url: `${SITE_URL}${path}`,
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: TRADE_SHOWS.length,
        itemListElement: TRADE_SHOWS.map((event, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: event.name,
          url: `${SITE_URL}${getTradeShowPath(event)}`,
        })),
      },
    },
  ];
}

export function buildTradeShowDetailSchema(event: TradeShow, description: string): object[] {
  const path = getTradeShowPath(event);
  const content = getTradeShowPageContent(event);
  const schemas: object[] = [
    getWebPageSchema({ name: `${event.name} exhibitor banner guide`, description, url: path }),
    getBreadcrumbSchema([
      { name: 'Home', url: '/' },
      { name: 'Trade Shows', url: '/trade-shows' },
      { name: event.shortName, url: path },
    ]),
    getFAQSchema(getTradeShowFaqs(event)),
  ];

  if (isIndexableTradeShow(event)) {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: event.name,
      description: content.summary,
      startDate: event.startDate,
      endDate: event.endDate,
      eventStatus: 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      location: {
        '@type': 'Place',
        name: content.venue || `${event.city}, ${event.state}`,
        address: {
          '@type': 'PostalAddress',
          addressLocality: event.city,
          addressRegion: event.state,
          addressCountry: 'US',
        },
      },
      image: `${SITE_URL}/images/og-vinyl-banners.png`,
      url: `${SITE_URL}${path}`,
      sameAs: content.sourceUrl,
      mainEntityOfPage: `${SITE_URL}${path}`,
    });
  }

  return schemas;
}
