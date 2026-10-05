import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Gift, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { bofMoney, bofRequest } from "@/lib/bofCash";

type AccountRewards = {
  enabled: boolean;
  joined?: boolean;
  availableCents?: number;
  pendingCents?: number;
};

export default function BOFAccountCard({ userId }: { userId: string }) {
  const [rewards, setRewards] = useState<AccountRewards | null>(null);
  useEffect(() => {
    let current = true;
    setRewards(null);
    (async () => {
      const status = await bofRequest("status");
      const wallet = status.enabled ? await bofRequest("wallet") : {};
      if (current) setRewards({ ...wallet, enabled: status.enabled });
    })().catch(() => {
      /* Keep the account entry available if rewards cannot load. */
    });
    return () => {
      current = false;
    };
  }, [userId]);

  return (
    <section
      aria-label="Your BOF Cash"
      className="mb-8 overflow-hidden rounded-2xl border border-[#18448d]/15 bg-white shadow-sm"
    >
      <div className="h-1.5 bg-[#f45b08]" />
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-orange-50 p-3 text-[#c94e00]">
            <Gift size={26} aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[#122641]">BOF Cash</h2>
            <p className="mt-1 max-w-lg text-sm leading-6 text-slate-600">
              {rewards?.joined
                ? "Your next project starts with a friend. Share BOF and earn more credit."
                : rewards?.enabled === false
                  ? "Referral rewards are coming soon. Your wallet and sharing tools will be right here when the program opens."
                  : "Give friends a deal. Earn $5–$10 per qualifying referral toward banners, yard signs, and car magnets."}
            </p>
            {rewards?.joined && (
              <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="flex items-center gap-1.5 font-bold text-[#18448d]">
                  <Wallet size={16} aria-hidden="true" />
                  {bofMoney(rewards.availableCents || 0)} available
                </span>
                <span className="text-slate-500">
                  {bofMoney(rewards.pendingCents || 0)} pending
                </span>
              </p>
            )}
          </div>
        </div>
        <Button
          asChild
          className="h-11 shrink-0 bg-[#18448d] hover:bg-[#12366f]"
        >
          <Link to="/bof-cash">
            {rewards?.joined
              ? "Share & view my wallet"
              : rewards?.enabled
                ? "Get my referral link"
                : "Explore BOF Cash"}
            <ArrowRight size={16} className="ml-2" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </section>
  );
}
