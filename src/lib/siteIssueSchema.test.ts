import { describe, expect, it } from 'vitest';
import { isOpenCustomerIssue, knownIssueCrawler } from './siteIssueSchema';

describe('issue traffic and triage', () => {
  it.each([
    ['Mozilla/5.0 (Linux; Android 6.0.1) Chrome/153.0.8010.52 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', 'googlebot'],
    ['GoogleOther', 'googleother'],
    ['AdsBot-Google (+http://www.google.com/adsbot.html)', 'adsbot-google'],
    ['meta-externalads/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)', 'meta-externalads'],
    ['Mozilla/5.0 (compatible; bingbot/2.0)', 'bingbot'],
  ])('recognizes an explicit crawler token in %s', (agent, expected) => {
    expect(knownIssueCrawler(agent)).toBe(expected);
  });
  it.each([
    '', 'Other', 'Mozilla/5.0 Chrome/153.0.8010.52 Mobile Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) Version/27.0.1 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 HeadlessChrome/153.0.8010.52 Safari/537.36', 'notGooglebot/1.0',
  ])('keeps unrecognized and real browsers in customer monitoring: %s', agent => {
    expect(knownIssueCrawler(agent)).toBeNull();
  });
  it('keeps reviewed customer issues open and excludes closed or non-customer reports', () => {
    for (const status of ['new', 'reviewed'] as const) expect(isOpenCustomerIssue({ status, traffic: 'customer' })).toBe(true);
    for (const status of ['resolved', 'archived'] as const) expect(isOpenCustomerIssue({ status, traffic: 'customer' })).toBe(false);
    for (const traffic of ['crawler', 'test'] as const) expect(isOpenCustomerIssue({ status: 'new', traffic })).toBe(false);
  });
});
