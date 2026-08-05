import { getBreadcrumbSchema, getWebPageSchema } from '@/components/SEO';
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
  const schemas: object[] = [
    getWebPageSchema({ name: `${event.name} exhibitor guide`, description, url: path }),
    getBreadcrumbSchema([
      { name: 'Home', url: '/' },
      { name: 'Trade Shows', url: '/trade-shows' },
      { name: event.shortName, url: path },
    ]),
  ];

  if (isIndexableTradeShow(event)) {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: event.name,
      description: event.editorial.summary,
      startDate: event.startDate,
      endDate: event.endDate,
      eventStatus: 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      location: {
        '@type': 'Place',
        name: event.editorial.venue,
        address: {
          '@type': 'PostalAddress',
          addressLocality: event.city,
          addressRegion: event.state,
          addressCountry: 'US',
        },
      },
      url: event.officialUrl,
      sameAs: event.editorial.sourceUrl,
    });
  }

  return schemas;
}
