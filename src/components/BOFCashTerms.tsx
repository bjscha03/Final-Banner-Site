import { useEffect, useRef } from "react";

export default function BOFCashTerms() {
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (window.location.hash === "#terms" && details.current) {
      details.current.open = true;
      details.current.scrollIntoView({ block: "start" });
    }
  }, []);
  return (
    <details
      id="terms"
      ref={details}
      className="scroll-mt-24 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600"
    >
      <summary className="cursor-pointer font-semibold text-slate-900">
        How BOF Cash works
      </summary>
      <div className="mt-4 space-y-3 leading-relaxed">
        <p>
          Share your personal link or code however you like. Photos, public
          posts, and reviews are optional.
        </p>
        <p>
          Earn $5 for each new customer's qualifying $50–$99.99 first order, or
          $10 for $100+. Orders containing car magnets require $75 in eligible
          merchandise. Ten qualifying referrals can earn $50–$100.
        </p>
        <p>
          Your friend saves 25% on eligible banners and yard signs, or 10% on
          car magnets, up to $25 total. The exact savings and eligibility are
          checked before payment. If another offer is better, it wins; a
          referral still earns a reward when the order meets the program's
          eligibility rules.
        </p>
        <p>
          Rewards become available 14 days after shipment. Use available credit
          on $50+ eligible merchandise, covering up to 25% of banners and yard
          signs or 15% of magnets. Mixed carts use those limits per product. BOF
          Cash replaces other promotional discounts; it does not stack.
        </p>
        <p>
          Finishing, stakes, services, shipping, tax, and options awaiting
          supplier-cost confirmation are excluded. No self-referrals, repeated
          rewards for the same customer, cash withdrawals, or transfers. Credits
          do not expire. Refunds or chargebacks may reverse rewards; credit
          already spent can offset future earnings. Spent credit is returned
          proportionally after a payment refund succeeds. If that refund later
          fails, returned credit is adjusted; any amount already used offsets
          future earnings rather than charging your card.
        </p>
      </div>
    </details>
  );
}
