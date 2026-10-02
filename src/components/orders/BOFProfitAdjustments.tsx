import { usd } from "@/lib/pricing";
export default function BOFProfitAdjustments({
  rewardCents = 0,
  releasedCents = 0,
}: {
  rewardCents?: number;
  releasedCents?: number;
}) {
  if (!rewardCents && !releasedCents) return null;
  return (
    <div className="my-2 rounded border border-blue-100 bg-blue-50 p-2 text-xs text-slate-700">
      {!!rewardCents && (
        <p>
          BOF Cash reward reserved: <strong>−{usd(rewardCents / 100)}</strong>
        </p>
      )}
      {!!releasedCents && (
        <p>
          Previously reserved BOF Cash used:{" "}
          <strong>+{usd(releasedCents / 100)}</strong>
        </p>
      )}
      <p className="mt-1 text-slate-500">
        Rewards are budgeted when earned. Spending that credit releases its
        reserve so the same reward is not counted twice.
      </p>
    </div>
  );
}
