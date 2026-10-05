import { useQuery } from '@tanstack/react-query';
import { adminFetch } from '@/lib/serverAuth';
import type { SiteIssue } from '@/lib/siteIssueSchema';

export type IssueRow = SiteIssue & { key: string };
export type IssueResult = { ok: true; issues: IssueRow[]; truncated: boolean; checkedAt: string };
let cached: IssueResult | undefined;
let etag = '';
export const SITE_ISSUES_QUERY = ['admin-site-issues'];
export function useSiteIssues(enabled: boolean) {
  return useQuery({ queryKey: SITE_ISSUES_QUERY, enabled, staleTime: 15_000, refetchInterval: 30_000,
    refetchIntervalInBackground: false, retry: 1,
    queryFn: async (): Promise<IssueResult> => {
      const response = await adminFetch('/.netlify/functions/admin-site-issues', {
        cache: 'no-store', headers: cached && etag ? { 'If-None-Match': etag } : {}, signal: AbortSignal.timeout(10_000),
      });
      if (response.status === 304 && cached) return { ...cached, checkedAt: new Date().toISOString() };
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'Could not check site issues.');
      etag = response.headers.get('etag') || ''; cached = data;
      return data;
    },
  });
}
