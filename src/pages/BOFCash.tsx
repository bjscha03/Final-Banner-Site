import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Gift, Wallet, ArrowRight } from "lucide-react";
import Layout from "@/components/Layout";
import BOFCashTerms from "@/components/BOFCashTerms";
import BOFReferralShare from "@/components/BOFReferralShare";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { setServerSessionToken } from "@/lib/serverAuth";
import { safeStorage } from "@/lib/utils";
import { bofRequest, bofMoney, saveBofReferral } from "@/lib/bofCash";

type Entry = {
  kind: string;
  amount_cents: number;
  available_at: string | null;
  created_at: string;
  state: string;
};
type WalletData = {
  joined: boolean;
  code: string;
  availableCents: number;
  pendingCents: number;
  reservedCents: number;
  adjustmentCents?: number;
  publicOrigin?: string;
  hasReceivedOrder?: boolean;
  entries: Entry[];
  reservations?: Array<{ order_id: string; wallet_cents: number }>;
};
export default function BOFCash() {
  const { code: publicCode } = useParams();
  const { user } = useAuth();
  // The password-only admin session has no customer profile or wallet.
  const hasCustomerSession =
    !!user?.id &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(user.id);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [walletSnapshot, setWalletSnapshot] = useState<{ ownerId: string; data: WalletData } | null>(null);
  // Never display one account's wallet while another account is loading, or
  // after sign-out. An in-flight response remains bound to its original owner.
  const wallet = user?.id && walletSnapshot?.ownerId === user.id ? walletSnapshot.data : null;
  const [email, setEmail] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const [shareChannel] = useState(() =>
    new URLSearchParams(window.location.search).get("share"),
  );
  useEffect(() => {
    if (wallet?.joined && shareChannel)
      document.getElementById("share")?.scrollIntoView({ block: "start" });
  }, [wallet?.joined, shareChannel]);
  const [claimToken, setClaimToken] = useState(() =>
    new URLSearchParams(window.location.hash.slice(1)).get("claim"),
  );
  useEffect(() => {
    if (claimToken)
      window.history.replaceState(null, "", window.location.pathname);
  }, [claimToken]);
  const load = async () => {
    const status = await bofRequest("status");
    setEnabled(status.enabled);
    if (status.enabled && user && hasCustomerSession) setWalletSnapshot({ ownerId: user.id, data: await bofRequest("wallet") });
  };
  useEffect(() => {
    let live = true;
    setWalletSnapshot(null);
    bofRequest("status")
      .then(async (status) => {
        if (!live) return;
        setEnabled(status.enabled);
        // An email invitation may belong to a different customer than the
        // current session. Claim it explicitly before loading that wallet.
        if (status.enabled && user && hasCustomerSession && !publicCode && !claimToken) {
          const data = await bofRequest("wallet");
          if (live) setWalletSnapshot({ ownerId: user.id, data });
        }
      })
      .catch((e) => {
        if (!live) return;
        if (e.status === 401 && user) {
          setServerSessionToken(null);
          safeStorage.removeItem("banners_current_user");
          window.dispatchEvent(new Event("user-changed"));
          setError("Your sign-in has expired. Request a fresh secure link below.");
        } else setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [user?.id, hasCustomerSession, publicCode, claimToken]);
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };
  const claim = () =>
    act(async () => {
      const result = await bofRequest("claim", { token: claimToken });
      setServerSessionToken(result.sessionToken);
      safeStorage.setItem("banners_current_user", JSON.stringify(result.user));
      setClaimToken(null);
      window.dispatchEvent(new Event("user-changed"));
      setMessage(
        "Your referral link is ready. Share it below to start earning BOF Cash.",
      );
      setWalletSnapshot({ ownerId: result.user.id, data: await bofRequest("wallet") });
    });
  const publicValid = !!publicCode && /^BOFREF-[A-F0-9]{12}$/.test(publicCode);
  return (
    <Layout>
      <Helmet>
        <title>BOF Cash | Banners On The Fly</title>
        <meta name="robots" content="noindex,nofollow" />
        <meta name="referrer" content="no-referrer" />
      </Helmet>
      <main className="max-w-4xl mx-auto px-4 py-10 sm:py-16">
        <div
          className={`rounded-3xl bg-[#122641] text-white ${wallet?.joined && !publicCode ? "p-6 sm:p-7" : "p-7 sm:p-10"}`}
        >
          <div className="flex items-center gap-2 text-orange-200 font-semibold">
            <Gift size={22} /> BOF CASH
          </div>
          <h1 className="mt-4 text-3xl sm:text-4xl font-bold">
            {publicCode
              ? "A little help with your next big idea."
              : wallet?.joined
                ? "Your BOF Cash."
                : "Good things are worth sharing."}
          </h1>
          <p className="mt-4 max-w-2xl text-blue-100 text-lg">
            {publicCode
              ? "Your friend sent you savings on your first BOF order."
              : "Turn referrals into banners, yard signs, and car magnets for your next project."}
          </p>
        </div>
        {error && (
          <p
            role="alert"
            className="my-4 rounded-xl bg-red-50 p-4 text-red-800"
          >
            {error}
          </p>
        )}
        {message && (
          <p
            role="status"
            className="my-4 rounded-xl bg-emerald-50 p-4 text-emerald-800"
          >
            {message}
          </p>
        )}
        {enabled === null && !error && (
          <p role="status" className="py-8">
            Opening BOF Cash…
          </p>
        )}
        {enabled === false && (
          <section className="my-6 p-6 border rounded-2xl">
            <h2 className="text-xl font-semibold">Coming soon</h2>
            <p className="mt-2 text-slate-600">
              We're getting BOF Cash ready. Invitations and rewards will open
              when the program launches.
            </p>
          </section>
        )}
        {enabled && publicCode && (
          <section className="my-6 rounded-2xl border p-6 space-y-4">
            {publicValid ? (
              <>
                <h2 className="font-bold text-2xl">
                  Save up to $25 on a qualifying first order
                </h2>
                <p>25% off eligible banners and yard signs · 10% off magnets</p>
                <p className="text-slate-600">
                  $50 merchandise minimum, or $75 if your order includes
                  magnets. Your exact offer appears at checkout. Your friend may
                  earn BOF Cash.
                </p>
                <p className="font-mono bg-slate-50 rounded-lg p-3 break-all">
                  {publicCode}
                </p>
                <Button
                  className="bg-orange-600 hover:bg-orange-700"
                  onClick={() => {
                    saveBofReferral(publicCode);
                    window.location.assign("/");
                  }}
                >
                  Shop with this referral{" "}
                  <ArrowRight className="ml-2" size={18} />
                </Button>
                <p className="text-xs text-slate-500">
                  You can check out as a guest. No photo or social post is
                  required.
                </p>
              </>
            ) : (
              <p>
                This referral link is invalid. Ask your friend to copy their
                link again.
              </p>
            )}
          </section>
        )}
        {enabled &&
          !publicCode &&
          !wallet?.joined &&
          (!hasCustomerSession || claimToken || wallet !== null) && (
            <section className="my-6 rounded-2xl border bg-white p-6 sm:p-8">
              <h2 className="text-xl font-bold">
                {claimToken
                  ? "Activate your free BOF Cash account"
                  : "One account. All your BOF Cash."}
              </h2>
              <p className="mt-2 mb-5 text-slate-600">
                Use the email from your order. We'll connect your past
                purchases, even if you checked out as a guest. After activation,
                you’ll see your own link, code, and sharing buttons.
              </p>
              {claimToken && (
                <Button
                  disabled={busy}
                  onClick={claim}
                  className="mb-5 bg-orange-600 hover:bg-orange-700"
                >
                  {busy
                    ? "Opening your account…"
                    : "Activate BOF Cash & Start Sharing"}
                </Button>
              )}
              {hasCustomerSession && !claimToken && (
                <Button
                  disabled={busy}
                  onClick={() =>
                    act(async () => {
                      await bofRequest("join", {});
                      await load();
                    })
                  }
                >
                  Activate BOF Cash & Start Sharing
                </Button>
              )}
              {(!hasCustomerSession || claimToken) && (
                <form
                  className="max-w-md space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    act(async () => {
                      const result = await bofRequest("request-link", {
                        email,
                      });
                      setMessage(result.message);
                    });
                  }}
                >
                  <label htmlFor="bof-email" className="block font-medium">
                    {claimToken ? "Need a fresh link?" : "Order email address"}
                  </label>
                  <Input
                    id="bof-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                  <Button
                    disabled={busy}
                    type="submit"
                    variant={claimToken ? "outline" : "default"}
                  >
                    Email me a secure link
                  </Button>
                </form>
              )}
              <p className="mt-4 text-xs text-slate-500">
                No password needed. Activating accepts the BOF Cash terms below.
              </p>
            </section>
          )}
        {enabled && wallet?.joined && !publicCode && (
          <div className="my-6 space-y-6">
            <BOFReferralShare code={wallet.code} channel={shareChannel} publicOrigin={wallet.publicOrigin} hasReceivedOrder={wallet.hasReceivedOrder} />
            <section
              aria-label="BOF Cash balance"
              className="grid grid-cols-2 sm:grid-cols-3 gap-3"
            >
              {[
                ["Available", wallet.availableCents],
                ["Pending", wallet.pendingCents],
                ["Reserved at checkout", wallet.reservedCents],
              ].map(([label, value], index) => (
                <div
                  key={String(label)}
                  className={`p-5 border rounded-2xl bg-white ${index === 0 ? "col-span-2 sm:col-span-1" : ""}`}
                >
                  <p className="text-sm text-slate-600">{label}</p>
                  <p className="text-3xl font-bold mt-2 text-[#18448D]">
                    {bofMoney(Number(value))}
                  </p>
                </div>
              ))}
            </section>
            <p className="text-sm text-slate-600">
              Pending rewards unlock 14 days after shipment. Reserved credit
              belongs to an unfinished payment and cannot be spent twice.
            </p>
            {!!wallet.adjustmentCents && wallet.adjustmentCents < 0 && (
              <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
                {bofMoney(-wallet.adjustmentCents)} of future rewards will cover
                a reward or refund-credit adjustment. This is not a charge to your card.
              </p>
            )}
            {!!wallet.reservations?.length && (
              <section className="border rounded-xl p-4 space-y-3">
                <h2 className="font-semibold">Unfinished checkouts</h2>
                {wallet.reservations.map((r) => (
                  <div
                    key={r.order_id}
                    className="flex flex-wrap items-center gap-3 justify-between"
                  >
                    <span>{bofMoney(r.wallet_cents)} reserved</span>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        act(async () => {
                          await bofRequest("release-reservation", {
                            orderId: r.order_id,
                          });
                          await load();
                          setMessage(
                            "Checkout canceled. Your credit is available again.",
                          );
                        })
                      }
                    >
                      Cancel checkout and release credit
                    </Button>
                  </div>
                ))}
              </section>
            )}
            <section className="rounded-2xl border p-6">
              <h2 className="text-xl font-bold flex gap-2 items-center">
                <Wallet size={22} />
                Use it on your next project
              </h2>
              <p className="my-3 text-slate-600">
                Sign in at checkout and choose “Use BOF Cash.” We'll show
                exactly what you can apply and keep your credit if another offer
                is better.
              </p>
              <Button asChild className="bg-orange-600 hover:bg-orange-700">
                <Link to="/">Start shopping</Link>
              </Button>
            </section>
            <section className="border rounded-2xl p-6">
              <h2 className="font-bold text-xl mb-4">Activity</h2>
              {wallet.entries.length === 0 ? (
                <p className="text-slate-600">
                  Your first reward will appear here after a friend completes a
                  qualifying order.
                </p>
              ) : (
                <ul className="divide-y">
                  {wallet.entries.map((entry, index) => (
                    <li
                      key={`${entry.created_at}-${index}`}
                      className="py-3 flex justify-between gap-3"
                    >
                      <div>
                        <p className="font-medium">
                          {{
                            reward: "Referral reward",
                            redemption: "Used at checkout",
                            reward_reversal: "Reward adjustment",
                            redemption_refund: Number(entry.amount_cents) < 0 ? "Refund credit adjustment" : "Returned after refund",
                          }[entry.kind] || "Adjustment"}
                        </p>
                        <p className="text-xs text-slate-500">
                          {new Date(entry.created_at).toLocaleDateString()}
                          {entry.kind === "reward" &&
                            (entry.state === "reversed"
                              ? " · Reversed"
                              : !entry.available_at
                                ? " · Awaiting shipment"
                                : new Date(entry.available_at) > new Date()
                                  ? ` · Available ${new Date(entry.available_at).toLocaleDateString()}`
                                  : " · Available")}
                        </p>
                      </div>
                      <span className="font-semibold">
                        {Number(entry.amount_cents) > 0 ? "+" : ""}
                        {bofMoney(entry.amount_cents)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
        <BOFCashTerms />
      </main>
    </Layout>
  );
}
