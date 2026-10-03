import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import BOFReferralShare from "@/components/BOFReferralShare";
import { Button } from "@/components/ui/button";
import { bofMoney } from "@/lib/bofCash";

const SESSION = "bof_cash_test_session_v1";
const REFERRAL = "bof_cash_test_referral_v1";
type Wallet = { code: string; email: string; availableCents: number; pendingCents: number; reservedCents: number; entries: Array<{ kind: string; amount_cents: number; created_at: string }>; pastOrders: Array<{ id: string; total_cents: number; status: string }> };
const storage = { get(key: string) { try { return localStorage.getItem(key) || ""; } catch { return ""; } }, set(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* In-memory sessions still work for this tab. */ } } };
export default function BOFCashTest() {
  const [claim] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get("claim"));
  const [token, setToken] = useState(() => storage.get(SESSION));
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [referral] = useState(() => {
    const value = new URLSearchParams(window.location.search).get("ref") || storage.get(REFERRAL);
    return /^BOFREF-[A-F0-9]{12}$/.test(value) ? value : "";
  });
  const request = async (action: string, input = {}, authToken = token) => {
    const response = await fetch(`/.netlify/functions/bof-cash-test?action=${action}`, { method: "POST", headers: { "Content-Type": "application/json", ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) }, body: JSON.stringify(input) });
    const data = await response.json();
    if (!response.ok || !data.isolatedTest) throw new Error(data.error || "The isolated test could not finish.");
    return data;
  };
  useEffect(() => {
    if (claim) window.history.replaceState(null, "", window.location.pathname + window.location.search);
    if (referral) storage.set(REFERRAL, referral);
  }, [claim, referral]);
  useEffect(() => {
    if (!token) return;
    let live = true;
    request("wallet", {}, token).then(data => { if (live) setWallet(data); }).catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [token]);
  const act = async (action: string) => {
    setBusy(true); setError(""); setMessage("");
    try {
      if (action === "claim") {
        const data = await request("claim", { token: claim }, "");
        storage.set(SESSION, data.sessionToken); setToken(data.sessionToken);
        setWallet(await request("wallet", {}, data.sessionToken));
        setMessage("Your isolated test account is activated. Its past orders and wallet are below.");
      } else {
        const data = await request(action, { referralCode: referral, idempotencyKey: crypto.randomUUID() });
        setWallet(data); setMessage(data.message || "Test wallet refreshed.");
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Please try again."); }
    finally { setBusy(false); }
  };
  return <>
    <Helmet><title>BOF Cash | Isolated owner test</title><meta name="robots" content="noindex,nofollow" /><meta name="referrer" content="no-referrer" /></Helmet>
    <div className="min-h-screen bg-slate-50 text-[#122641]">
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:py-12">
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><strong>ISOLATED OWNER TEST</strong><br />All orders, referral savings, and wallet amounts on this page are test simulations. No payment is collected and no live account, order, or credit is changed.</div>
        <div><h1 className="text-3xl font-bold">Try the complete BOF Cash flow.</h1><p className="mt-3 leading-7 text-slate-600">Activate once, try the sharing buttons, open your referral link, and see how a qualifying order moves through the test wallet.</p></div>
        {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
        {message && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-900">{message}</p>}
        {!wallet && <section className="rounded-2xl border bg-white p-6"><h2 className="text-xl font-bold">Activate your private test account</h2><p className="my-3 leading-6 text-slate-600">Use the private test link sent to your Outlook inbox. This activation belongs only to the isolated test.</p>{claim ? <Button disabled={busy} className="h-auto min-h-12 whitespace-normal bg-[#c2410c] hover:bg-[#9a3412]" onClick={() => act("claim")}>{busy ? "Activating…" : "Activate test BOF Cash & start sharing"}</Button> : <p className="text-sm text-slate-500">Open the activation button in your test email to begin.</p>}</section>}
        {wallet && <>
          <BOFReferralShare code={wallet.code} publicOrigin={window.location.origin} referralPath={`/bof-cash-test/share/${wallet.code}`} testMode />
          <section id="testing" className="scroll-mt-6 rounded-2xl border bg-white p-6"><h2 className="text-xl font-bold">Follow a referral into your test wallet</h2><ol className="my-5 space-y-3 pl-5 text-sm leading-6 text-slate-600 list-decimal"><li><a className="font-semibold text-[#18448d] underline" href={`/bof-cash-test/share/${wallet.code}`}>Open your test referral link</a>, then select “Continue the isolated referral test.”</li><li>Simulate a qualifying referred order. The test reward starts pending.</li><li>Advance the simulated shipment clock 15 days, then try a test redemption.</li></ol>
            <p className="mb-4 text-sm text-slate-600">{referral === wallet.code ? "Your test referral code was carried back correctly." : "Open your test referral link above to verify attribution first."}</p>
            <div className="flex flex-wrap gap-3"><Button disabled={busy || referral !== wallet.code} onClick={() => act("refer")} className="bg-[#c2410c] hover:bg-[#9a3412]">Simulate qualifying referral</Button><Button disabled={busy || wallet.pendingCents <= 0} variant="outline" onClick={() => act("mature")}>Advance 15 days</Button><Button disabled={busy || wallet.availableCents <= 0} variant="outline" onClick={() => act("redeem")}>Use test BOF Cash</Button></div>
            <p className="mt-4 text-xs leading-5 text-slate-500">Uses BOF’s actual pricing rules and wallet ledger in a separate database. Payment, shipping, and time are simulated. Thirty simulated orders maximum.</p>
          </section>
          <section className="rounded-2xl bg-[#122641] p-6 text-white"><h2 className="text-xl font-bold">Test wallet</h2><div className="mt-5 grid grid-cols-2 gap-4"><div><p className="text-sm text-blue-100">Available test credit</p><p className="mt-1 text-3xl font-bold">{bofMoney(wallet.availableCents)}</p></div><div><p className="text-sm text-blue-100">Pending test credit</p><p className="mt-1 text-3xl font-bold">{bofMoney(wallet.pendingCents)}</p></div></div></section>
          <section className="rounded-2xl border bg-white p-6"><h2 className="text-xl font-bold">Past orders linked in this test account</h2><p className="mt-2 text-sm leading-6 text-slate-600">Orders with your verified email connect to this isolated account automatically. These records belong to the test database.</p>{wallet.pastOrders.length ? <ul className="mt-4 divide-y">{wallet.pastOrders.map(order => <li key={order.id} className="flex justify-between gap-4 py-3 text-sm"><span>Order {order.id.slice(0,8)} · {order.status}</span><strong>{bofMoney(order.total_cents)}</strong></li>)}</ul> : <p className="mt-4 text-sm text-slate-500">No matching past orders were found in this test account.</p>}</section>
          <section className="rounded-2xl border bg-white p-6"><h2 className="text-xl font-bold">Test wallet activity</h2>{wallet.entries.length ? <ul className="mt-4 divide-y">{wallet.entries.map((entry,i) => <li key={`${entry.created_at}-${i}`} className="flex justify-between gap-4 py-3 text-sm"><span>{entry.kind === "reward" ? "Simulated referral reward" : entry.kind === "redemption" ? "Simulated checkout redemption" : "Test adjustment"}</span><strong>{bofMoney(entry.amount_cents)}</strong></li>)}</ul> : <p className="mt-4 text-sm text-slate-500">Your simulated referrals and redemptions will appear here.</p>}</section>
        </>}
      </main>
    </div>
  </>;
}
