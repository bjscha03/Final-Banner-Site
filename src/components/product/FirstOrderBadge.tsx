import '@/styles/first-order-badge.css';

/** One optically centered badge across product photos, cards and screen sizes. */
export default function FirstOrderBadge({ className = '', testId }: { className?: string; testId?: string }) {
  return <div data-testid={testId || 'first-order-badge'} className={`first-order-badge ${className}`} aria-label="20% off your first order">
    <strong>20%</strong><b>OFF</b><span>YOUR FIRST<br />ORDER</span>
  </div>;
}
