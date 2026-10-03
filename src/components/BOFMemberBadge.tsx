export default function BOFMemberBadge({ joined }: { joined?: boolean }) {
  return joined ? (
    <span
      className="inline-flex items-center ml-1 text-amber-600"
      title="BOF Cash member"
      aria-label="BOF Cash member"
    >
      <span aria-hidden="true">★</span>
    </span>
  ) : null;
}
