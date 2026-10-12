import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowRight, Check, Copy, Plane, Wallet } from "lucide-react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { useCartStore, type DiscountCode } from "@/store/cart";
import { readActiveCheckoutMarker } from "@/components/checkout/checkoutPaymentState";

type Offer = {
  valid: boolean;
  code: string;
  discount?: DiscountCode;
  terms?: string;
  walletReady?: boolean;
  error?: string;
};
export default function LouisvilleOffer() {
  const [params] = useSearchParams(),
    navigate = useNavigate();
  const code = (params.get("code") || "").trim().toUpperCase();
  const [offer, setOffer] = useState<Offer | null>(null),
    [error, setError] = useState(""),
    [copied, setCopied] = useState(false),
    [retry, setRetry] = useState(0);
  const started = useRef(false);
  const start = (current: Offer) => {
    if (!current.valid || !current.discount) return;
    if (readActiveCheckoutMarker()) {
      setError(
        "Finish or cancel your current checkout before applying this coupon.",
      );
      return;
    }
    useCartStore.getState().applyDiscountCode(current.discount);
    navigate("/design", { replace: true });
  };
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    setOffer(null);
    if (!/^LOU25-[A-F0-9]{20}$/.test(code)) {
      setError("Open the personal coupon link from your invitation email.");
      return;
    }
    fetch(
      `/.netlify/functions/louisville-coupon?code=${encodeURIComponent(code)}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw Error(data.error || "Your coupon could not be loaded.");
        if (controller.signal.aborted) return;
        setOffer(data);
        if (data.valid && params.get("start") === "1" && !started.current) {
          started.current = true;
          start(data);
        }
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [code, retry]);
  return (
    <Layout>
      <Helmet>
        <title>Your 25% Off Banner Coupon | Banners On The Fly</title>
        <meta name="robots" content="noindex,nofollow" />
        <meta name="referrer" content="no-referrer" />
      </Helmet>
      <main className="mx-auto max-w-xl px-4 py-10 sm:py-16">
        <p className="mb-4 text-center text-xs font-bold tracking-[0.2em] text-[#18448d]">
          A LITTLE LOCAL LOVE · LOUISVILLE
        </p>
        <h1 className="mb-7 text-center text-3xl font-bold text-[#122641]">
          Your next banner starts here.
        </h1>
        <div className="overflow-hidden rounded-3xl bg-[#122641] text-white shadow-xl">
          <div className="px-6 py-7 sm:px-9">
            <p className="text-xs font-semibold tracking-widest text-orange-300">
              YOUR PERSONAL BANNER COUPON
            </p>
            <p className="mt-3 text-6xl font-black tracking-tight sm:text-7xl">
              25% OFF
            </p>
            <p className="mt-4 flex items-center gap-2 text-lg">
              <Plane size={20} className="text-orange-300" />
              Plus free next-day air
            </p>
            <p className="mt-1 text-xs text-slate-300">
              Shipping after production. No expiration.
            </p>
          </div>
          <div className="border-t-2 border-dashed border-orange-300/50 bg-[#fff3e8] p-6 text-[#122641] sm:px-9">
            <label
              htmlFor="coupon-code"
              className="text-[10px] font-bold tracking-widest text-[#9b3c00]"
            >
              YOUR CODE
            </label>
            <input
              id="coupon-code"
              readOnly
              value={offer?.code || ""}
              onFocus={(e) => e.target.select()}
              placeholder="Loading your coupon…"
              className="mt-2 block w-full border-0 bg-transparent font-mono text-base font-bold focus:outline-none sm:text-lg"
            />
            <button
              disabled={!offer?.valid}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(offer!.code);
                  setCopied(true);
                } catch {
                  setError("Select the code above and choose Copy.");
                }
              }}
              className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-[#18448d] disabled:opacity-50"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? "Code copied" : "Copy code"}
            </button>
          </div>
        </div>
        {(error || offer?.error) && (
          <p
            role="alert"
            className="mt-5 rounded-lg bg-amber-50 p-4 text-sm text-amber-900"
          >
            {error || offer?.error}
            {error && /^LOU25-/.test(code) && (
              <button
                onClick={() => setRetry((r) => r + 1)}
                className="ml-2 underline"
              >
                Retry
              </button>
            )}
          </p>
        )}
        {!offer && !error && (
          <p className="mt-5 text-center text-sm text-slate-500" role="status">
            Opening your personal offer…
          </p>
        )}
        <Button
          className="mt-7 h-14 w-full bg-[#c94e00] text-base"
          disabled={!offer?.valid}
          onClick={() => offer && start(offer)}
        >
          Use 25% off & start designing{" "}
          <ArrowRight className="ml-2" size={18} />
        </Button>
        <p className="mt-3 text-center text-sm text-slate-500">
          Your code applies automatically. Use the email address that received
          your invitation at checkout.
        </p>
        {offer?.valid && offer.walletReady && (
          <a
            href={`/.netlify/functions/louisville-coupon?action=wallet&code=${encodeURIComponent(code)}`}
            className="mt-5 flex h-12 items-center justify-center gap-2 rounded-xl bg-black px-4 font-semibold text-white"
          >
            <Wallet size={20} />
            Save coupon to Apple Wallet
          </a>
        )}
        <p className="mt-7 text-xs leading-5 text-slate-500">{offer?.terms}</p>
        <p className="mt-5 text-center text-sm text-slate-500">
          Need a hand?{" "}
          <a
            href="mailto:support@bannersonthefly.com"
            className="text-[#18448d] underline"
          >
            Email our team
          </a>
        </p>
      </main>
    </Layout>
  );
}
