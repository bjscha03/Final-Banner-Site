/** Editorial dates are calendar dates, not the reader's local instant. */
export function formatBlogDate(value: string): string {
  return new Date(value).toLocaleDateString('en-US', {
    timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric',
  });
}
