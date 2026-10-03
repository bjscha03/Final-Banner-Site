import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useCartStore, type DiscountCode } from "@/store/cart";
import {
  bofRequest,
  bofPricingItems,
  bofMoney,
  readBofReferral,
  saveBofReferral,
} from "@/lib/bofCash";
import { authorizedHeaders } from "@/lib/serverAuth";
import { Button } from "@/components/ui/button";

type Quote = {
  availableCents: number;
  usableCents: number;
  message: string;
  discount?: DiscountCode;
};
export default function BOFCashCheckout({
  locked = false,
}: {
  locked?: boolean;
}) {
  const { user } = useAuth();
  const {
    items,
    discountCode,
    applyDiscountCode,
    removeDiscountCode,
    getResolvedDiscount,
    sameDayHitService,
    saturdayDelivery,
  } = useCartStore();
  const [enabled, setEnabled] = useState(false),
    [quote, setQuote] = useState<Quote | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const previous = useRef<DiscountCode | null>(null),
    appliedKey = useRef<string | null>(null),
    generation = useRef(0);
  const isCash = !!discountCode?.code.startsWith("BOFCASH-");
  // Keep artwork URLs out; changing a priced selection invalidates the quote.
  const key = JSON.stringify([
    sameDayHitService,
    saturdayDelivery,
    items.map((i) => [
      i.id,
      i.product_type,
      i.width_in,
      i.height_in,
      i.quantity,
      i.material,
      i.line_total_cents,
      i.rope_feet,
      i.pole_pocket_position,
      i.yard_sign_sidedness,
      i.yard_sign_step_stakes_qty,
    ]),
  ]);
  useEffect(() => {
    let live = true;
    bofRequest("status")
      .then((s) => {
        if (live) setEnabled(s.enabled);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (isCash && appliedKey.current !== key && !locked) {
      removeDiscountCode();
      setQuote(null);
      setMessage(
        "Your cart changed. Refresh the amount of BOF Cash you can use.",
      );
    }
  }, [key, isCash, locked, removeDiscountCode]);
  useEffect(() => {
    if (!isCash || locked) return;
    const timer = setTimeout(
      () => {
        removeDiscountCode();
        setQuote(null);
        setMessage(
          "Refresh BOF Cash before paying. Your credit is still in your wallet.",
        );
      },
      Math.max(
        0,
        Math.min(
          25 * 60000,
          (Date.parse(discountCode?.expiresAt || "") ||
            Date.now() + 25 * 60000) -
            Date.now() -
            10000,
        ),
      ),
    );
    return () => clearTimeout(timer);
  }, [
    isCash,
    locked,
    discountCode?.code,
    discountCode?.expiresAt,
    removeDiscountCode,
  ]);
  useEffect(() => {
    generation.current++;
    setQuote(null);
  }, [key, user?.id]);
  const refresh = async () => {
    const current = ++generation.current;
    setBusy(true);
    setMessage("");
    try {
      const result = await bofRequest("quote", {
        items: bofPricingItems(items),
        extraChargedCents:
          useCartStore.getState().getSameDayFeeCents() +
          useCartStore.getState().getSaturdayDeliveryFeeCents(),
        currentCode: isCash ? previous.current?.code : discountCode?.code,
      });
      if (current === generation.current) setQuote(result);
    } catch (e) {
      if (current === generation.current)
        setMessage(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (
      !enabled ||
      !items.length ||
      locked ||
      (discountCode && !discountCode.automaticFirstOrder)
    )
      return;
    const ref = readBofReferral();
    if (!ref) return;
    let cancelled = false;
    fetch("/.netlify/functions/validate-discount-code", {
      method: "POST",
      headers: authorizedHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        code: ref,
        items: bofPricingItems(items),
        email: user?.email || null,
        userId: user?.id || null,
      }),
    })
      .then((r) => r.json())
      .then((result) => {
        if (cancelled) return;
        if (result.valid) {
          if (
            result.discount.discountAmountCents >
            getResolvedDiscount().appliedDiscountAmountCents
          ) {
            applyDiscountCode(result.discount);
            saveBofReferral(ref);
          }
          setMessage(
            "Your friend’s referral is linked. The best available offer is applied.",
          );
        } else
          setMessage(
            result.error || "Check referral eligibility before paying.",
          );
      })
      .catch(() => {
        if (!cancelled)
          setMessage(
            "Your referral is saved. You can retry its code before paying.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, key, user?.id, locked, discountCode?.code]);
  if (!enabled) return null;
  return (
    <section
      className="my-4 rounded-xl border border-blue-200 bg-blue-50 p-4"
      aria-label="BOF Cash at checkout"
    >
      <h3 className="font-semibold text-[#18448D]">BOF Cash</h3>
      {!user ? (
        <p className="mt-2 text-sm text-slate-600">
          <Link className="underline font-medium" to="/bof-cash">
            Open your BOF Cash account
          </Link>{" "}
          to use your credit. You can still place this order as a guest.
        </p>
      ) : (
        <>
          <p className="my-2 text-sm text-slate-600">
            {isCash
              ? "BOF Cash applied."
              : quote
                ? `${bofMoney(quote.availableCents)} available · ${bofMoney(quote.usableCents)} usable on this order`
                : "Check your balance and see exactly what you can use."}
          </p>
          {quote && !isCash && (
            <p className="my-2 text-sm text-slate-600">{quote.message}</p>
          )}
          {isCash ? (
            <Button
              size="sm"
              variant="outline"
              disabled={locked}
              onClick={() => {
                if (previous.current) applyDiscountCode(previous.current);
                else removeDiscountCode();
                setQuote(null);
              }}
            >
              Remove BOF Cash
            </Button>
          ) : quote?.discount ? (
            <Button
              size="sm"
              disabled={locked || busy}
              onClick={() => {
                previous.current = discountCode;
                appliedKey.current = key;
                applyDiscountCode(quote.discount!);
              }}
            >
              Use {bofMoney(quote.usableCents)} BOF Cash
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={locked || busy}
              onClick={refresh}
            >
              {busy ? "Checking…" : "Check my BOF Cash"}
            </Button>
          )}
        </>
      )}
      {message && (
        <p role="status" className="mt-2 text-sm text-slate-700">
          {message}
        </p>
      )}
    </section>
  );
}
