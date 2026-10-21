import { useQuery } from '@tanstack/react-query';
import { adminFetch } from '@/lib/serverAuth';
import type { SiteIssue } from '@/lib/siteIssueSchema';

export type IssueRow = SiteIssue & { key: string };
export type IssueResult = { ok: true; issues: IssueRow[]; truncated: boolean; nextCursor?: string | null; checkedAt: string };
let cached: IssueResult | undefined;
let etag = '';
export const SITE_ISSUES_QUERY = ['admin-site-issues'];
export function useSiteIssues(enabled: boolean) {
  return useQuery({ queryKey: SITE_ISSUES_QUERY, enabled, staleTime: 15_000, refetchInterval: 30_000,
    refetchIntervalInBackground: false, retry: 1,
    queryFn: async ({ signal }): Promise<IssueResult> => {
      const response = await adminFetch('/.netlify/functions/admin-site-issues', {
        cache: 'no-store', headers: cached && etag ? { 'If-None-Match': etag } : {}, signal: AbortSignal.timeout(10_000),
      });
      if (response.status === 304 && cached) return { ...cached, checkedAt: new Date().toISOString() };
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'Could not check site issues.');
      const issues: IssueRow[] = [...data.issues];
      let page: IssueResult = data;
      const cursors = new Set<string>();
      while (page.nextCursor) {
        const cursor = page.nextCursor;
        if (cursors.has(cursor)) throw new Error('Issue pagination did not advance. Please refresh.');
        cursors.add(cursor);
        if (signal.aborted) throw new Error('Issue refresh cancelled.');
        const older = await adminFetch(`/.netlify/functions/admin-site-issues?before=${encodeURIComponent(cursor)}`, {
          cache: 'no-store', signal: AbortSignal.timeout(10_000),
        });
        page = await older.json();
        if (!older.ok || !page.ok) throw new Error('Could not load older site issues. Please refresh.');
        issues.push(...page.issues);
      }
      const complete = { ...data, issues: [...new Map(issues.map(issue => [issue.key, issue])).values()], truncated: page.truncated, nextCursor: null };
      etag = response.headers.get('etag') || ''; cached = complete;
      return complete;
    },
  });
}
