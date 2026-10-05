import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Mail,
  PackageCheck,
  ShoppingBag,
  Share2,
} from "lucide-react";
import { Link } from "react-router-dom";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import BOFMemberBadge from "@/components/BOFMemberBadge";
import BOFCashTerms from "@/components/BOFCashTerms";
import BOFEmailPreview from "@/components/admin/BOFEmailPreview";
import BOFReferralShare from "@/components/BOFReferralShare";
import { bofRequest, bofMoney } from "@/lib/bofCash";
import { useAuth, isAdmin } from "@/lib/auth";

type Customer = {
  email: string;
  name: string;
  orders: number;
  member_code: string | null;
  invitation_status: string | null;
};
export default function Referrals() {
  const { user, loading } = useAuth();
  const [data, setData] = useState<{
    enabled: boolean;
    schemaReady: boolean;
    customers: Customer[];
    summary: Record<string, number>;
  } | null>(null);
  const [preview, setPreview] = useState<{
      subject: string;
      html: string;
    } | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all");
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewError, setPreviewError] = useState("");
  const [sharingPreview, setSharingPreview] = useState(
    () => typeof window !== "undefined" && window.location.hash === "#sharing",
  );
  const loadPreview = async () => {
    setPreviewLoading(true);
    setPreviewError("");
    try {
      setPreview((await bofRequest("admin-preview")).email);
    } catch (e) {
      setPreviewError(
        e instanceof Error ? e.message : "The email preview could not load.",
      );
    } finally {
      setPreviewLoading(false);
    }
  };
  const refresh = async () => {
    await Promise.all([bofRequest("admin").then(setData), loadPreview()]);
  };
  useEffect(() => {
    if (!isAdmin(user)) return;
    refresh().catch((e) => setError(e.message));
  }, [user?.id]);
  const send = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await bofRequest("send-invitations", {
        emails: selected,
        confirm: true,
      });
      setMessage(
        result.results
          .map(
            (r: { email: string; status: string; reason?: string }) =>
              `${r.email}: ${r.status}${r.reason ? ` (${r.reason})` : ""}`,
          )
          .join("\n"),
      );
      setSelected([]);
      setConfirm(false);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };
  if (!loading && !isAdmin(user))
    return (
      <Layout>
        <div className="p-10">
          Sign in as an administrator to manage BOF Cash.
        </div>
      </Layout>
    );
  const customers =
    data?.customers.filter(
      (c) =>
        (!search ||
          `${c.name} ${c.email}`
            .toLowerCase()
            .includes(search.toLowerCase())) &&
        (filter === "all" ||
          (filter === "joined" && c.member_code) ||
          (filter === "invited" &&
            !c.member_code &&
            c.invitation_status === "sent") ||
          (filter === "not_invited" && !c.member_code && !c.invitation_status)),
    ) || [];
  return (
    <Layout>
      <div className="bg-slate-50">
        <main className="max-w-6xl mx-auto px-4 py-8">
          <div className="flex flex-wrap justify-between gap-4 items-center">
            <div>
              <p className="font-semibold text-[#18448D]">CUSTOMER REFERRALS</p>
              <h1 className="text-3xl font-bold mt-1">BOF Cash</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setSharingPreview(true)}>
                <Share2 size={16} className="mr-2" />
                See customer sharing
              </Button>
              <Button asChild variant="outline">
                <Link to="/admin/orders">Orders</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/admin/customers">Customers</Link>
              </Button>
            </div>
          </div>
          <p
            role="status"
            aria-live="polite"
            className={`my-5 rounded-xl p-4 ${!data ? "bg-slate-100 text-slate-700" : data.enabled ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}
          >
            <strong>
              {!data
                ? error
                  ? "Program status could not be loaded"
                  : "Checking program status…"
                : data.enabled
                ? "Program is live"
                : "Program is currently disabled"}
            </strong>{" "}
            ·{" "}
            {!data
              ? error
                ? "Refresh this page to check the current status."
                : "Loading the current BOF Cash status."
              : data.enabled
              ? "Invitations are available for selected customers."
              : "Sending invitations and issuing credit are disabled."}
            {data && !data.schemaReady
              ? " Database setup is also pending."
              : ""}
          </p>
          {error && (
            <p role="alert" className="my-4 text-red-700">
              {error}
            </p>
          )}
          {message && (
            <p
              role="status"
              className="my-4 p-4 bg-slate-50 whitespace-pre-line text-sm"
            >
              {message}
            </p>
          )}
          <div className="grid sm:grid-cols-4 gap-3 mb-6">
            {[
              ["Referred orders", String(data?.summary.referred_orders || 0)],
              [
                "Net merchandise sales",
                bofMoney(data?.summary.net_sales_cents || 0),
              ],
              [
                "Contribution after allowances",
                bofMoney(data?.summary.contribution_cents || 0),
              ],
              ["Rewards committed", bofMoney(data?.summary.rewards_cents || 0)],
            ].map(([label, value]) => (
              <div key={label} className="border rounded-xl bg-white p-4">
                <p className="text-sm text-slate-600">{label}</p>
                <p className="font-bold text-2xl mt-2">{data ? value : "—"}</p>
              </div>
            ))}
          </div>
          <p className="text-sm text-slate-500 mb-5">
            Contribution includes supplier production, supplier shipping,
            payment fee and refund allowances, and the full new reward. It
            excludes advertising and fixed overhead. Review the first 30
            completed referrals before expanding the program.
          </p>
          <section className="border rounded-2xl bg-white p-5 mb-6">
            <div className="flex flex-wrap justify-between items-center gap-4">
              <h2 className="text-xl font-bold">Invite past customers</h2>
              <Button
                disabled={!data?.enabled || !selected.length || busy}
                onClick={() => setConfirm(true)}
              >
                Preview {selected.length || ""} invitation
                {selected.length === 1 ? "" : "s"}
              </Button>
            </div>
            <p className="text-sm text-slate-600 my-3">
              ★ means the customer has joined. Invited customers haven't
              activated yet. Joined customers and previously sent invitations
              are skipped automatically; marketing opt-outs are checked again
              before sending.
            </p>
            <div className="flex flex-wrap gap-3 mb-4">
              <Input
                aria-label="Find customer"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Find a name or email"
                className="sm:max-w-sm"
              />
              <select
                aria-label="Membership status"
                className="rounded-md border p-2"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">All customers</option>
                <option value="joined">Joined ★</option>
                <option value="invited">Invited</option>
                <option value="not_invited">Not invited</option>
              </select>
            </div>
            <ul className="divide-y">
              {customers.map((c) => (
                <li key={c.email} className="py-3 flex items-center gap-3">
                  <input
                    type="checkbox"
                    aria-label={`Invite ${c.email}`}
                    checked={selected.includes(c.email)}
                    disabled={
                      !!c.member_code ||
                      c.invitation_status === "sent" ||
                      (!selected.includes(c.email) && selected.length >= 20)
                    }
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, c.email]
                          : selected.filter((x) => x !== c.email),
                      )
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold break-words">
                      {c.name || c.email}
                      <BOFMemberBadge joined={!!c.member_code} />
                    </p>
                    <p className="text-sm text-slate-500 break-all">
                      {c.email}
                    </p>
                  </div>
                  <span className="text-sm rounded-full bg-slate-100 px-3 py-1">
                    {c.member_code
                      ? "Joined"
                      : c.invitation_status === "sent"
                        ? "Invited"
                        : c.invitation_status === "error"
                          ? "Send failed"
                          : c.invitation_status === "processing"
                            ? "Sending"
                            : "Not invited"}
                  </span>
                </li>
              ))}
            </ul>
            {!customers.length && (
              <p className="py-6 text-slate-500">
                {data?.schemaReady
                  ? "No matching customers."
                  : "Customer membership will appear after database setup."}
              </p>
            )}
            <p className="text-xs text-slate-500 mt-4">
              Shows the 200 most recent customers. Select up to 20 per send.
            </p>
          </section>
          <section
            className="mb-6 grid items-start gap-6 lg:grid-cols-[260px_minmax(0,1fr)]"
            aria-labelledby="email-preview-title"
          >
            <div className="pt-1">
              <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-[#18448d]">
                <Mail size={20} aria-hidden="true" />
              </span>
              <h2
                id="email-preview-title"
                className="text-xl font-bold text-slate-900"
              >
                Email preview
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                This is the invitation your customers will receive. Check it on
                desktop and mobile before sending.
              </p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => setSharingPreview(true)}
              >
                <Share2 size={16} className="mr-2" />
                See customer sharing
              </Button>
              <div className="mt-6 space-y-5">
                {[
                  [
                    ShoppingBag,
                    "After purchase",
                    "A short mention in the order confirmation.",
                  ],
                  [
                    PackageCheck,
                    "After delivery",
                    "One separate invitation. If delivery isn't recorded, it goes three days after shipment.",
                  ],
                  [
                    CheckCircle2,
                    "Already joined",
                    "No more activation invitations.",
                  ],
                ].map(([Icon, title, detail]) => {
                  const StatusIcon = Icon as typeof Mail;
                  return (
                    <div className="flex gap-3" key={String(title)}>
                      <StatusIcon
                        size={17}
                        className="mt-0.5 shrink-0 text-slate-400"
                        aria-hidden="true"
                      />
                      <div>
                        <p className="text-sm font-semibold text-slate-800">
                          {String(title)}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          {String(detail)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            {preview ? (
              <BOFEmailPreview subject={preview.subject} html={preview.html} />
            ) : (
              <div
                className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-600"
                role={previewError ? "alert" : "status"}
              >
                {previewLoading ? (
                  "Loading your email preview…"
                ) : (
                  <>
                    <p>{previewError || "Email preview is unavailable."}</p>
                    <Button
                      className="mt-4"
                      variant="outline"
                      onClick={loadPreview}
                    >
                      Try again
                    </Button>
                  </>
                )}
              </div>
            )}
          </section>
          <BOFCashTerms />
          <Dialog open={sharingPreview} onOpenChange={setSharingPreview}>
            <DialogContent className="max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-2xl overflow-y-auto bg-slate-50 p-4 sm:p-6">
              <DialogTitle>What customers see after activation</DialogTitle>
              <DialogDescription>
                The sharing tools appear at the top of their BOF Cash page. This
                preview uses an example code; sharing and copying are disabled
                here.
              </DialogDescription>
              <BOFReferralShare code="BOFREF-YOUR-CODE" preview hasReceivedOrder />
              <Button
                variant="outline"
                onClick={() => setSharingPreview(false)}
              >
                Close sharing preview
              </Button>
            </DialogContent>
          </Dialog>
          <Dialog
            open={confirm}
            onOpenChange={(value) => {
              if (!busy) setConfirm(value);
            }}
          >
            <DialogContent>
              <DialogTitle>
                Send {selected.length} invitation
                {selected.length === 1 ? "" : "s"}?
              </DialogTitle>
              <DialogDescription>
                Each eligible customer will receive the email previewed above,
                with their own secure account link.
              </DialogDescription>
              <ul className="max-h-48 overflow-auto text-sm mb-5">
                {selected.map((email) => (
                  <li key={email} className="py-1 break-all">
                    {email}
                  </li>
                ))}
              </ul>
              <div className="flex gap-3 justify-end">
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => setConfirm(false)}
                >
                  Cancel
                </Button>
                <Button disabled={busy} onClick={send}>
                  {busy ? "Sending…" : "Send invitations"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </main>
      </div>
    </Layout>
  );
}
