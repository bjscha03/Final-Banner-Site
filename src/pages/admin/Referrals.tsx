import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import BOFMemberBadge from "@/components/BOFMemberBadge";
import BOFCashTerms from "@/components/BOFCashTerms";
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
  const refresh = async () => {
    const [report, email] = await Promise.all([
      bofRequest("admin"),
      bofRequest("admin-preview"),
    ]);
    setData(report);
    setPreview(email.email);
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
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex flex-wrap justify-between gap-4 items-center">
          <div>
            <p className="font-semibold text-[#18448D]">CUSTOMER REFERRALS</p>
            <h1 className="text-3xl font-bold mt-1">BOF Cash</h1>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link to="/admin/orders">Orders</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/admin/customers">Customers</Link>
            </Button>
          </div>
        </div>
        <p
          className={`my-5 rounded-xl p-4 ${data?.enabled ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}
        >
          <strong>
            {data?.enabled ? "Program is live" : "Program is awaiting approval"}
          </strong>{" "}
          ·{" "}
          {data?.enabled
            ? "Invitations are available for selected customers."
            : "Sending invitations and issuing credit are disabled."}
          {data && !data.schemaReady ? " Database setup is also pending." : ""}
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
            <div key={label} className="border rounded-xl p-4">
              <p className="text-sm text-slate-600">{label}</p>
              <p className="font-bold text-2xl mt-2">{value}</p>
            </div>
          ))}
        </div>
        <p className="text-sm text-slate-500 mb-5">
          Contribution includes supplier production, supplier shipping, payment
          fee and refund allowances, and the full new reward. It excludes
          advertising and fixed overhead. Review the first 30 completed
          referrals before expanding the program.
        </p>
        <section className="border rounded-2xl p-5 mb-6">
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
            ★ means the customer has joined. Invited customers haven't activated
            yet. Joined customers and previously sent invitations are skipped
            automatically; marketing opt-outs are checked again before sending.
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
                  <p className="text-sm text-slate-500 break-all">{c.email}</p>
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
        <section className="border rounded-2xl p-5 mb-6">
          <h2 className="text-xl font-bold">Email preview</h2>
          <p className="my-3 text-sm text-slate-600">
            New orders get a small invitation in their confirmation and one
            separate email after recorded delivery, or three days after shipment
            if delivery has not been recorded. Customers who already joined do
            not get the second invitation.
          </p>
          {preview && (
            <>
              <p className="font-medium my-3">Subject: {preview.subject}</p>
              <iframe
                title="BOF Cash invitation preview"
                sandbox=""
                srcDoc={preview.html}
                className="w-full h-[650px] rounded-xl border"
              />
            </>
          )}
        </section>
        <BOFCashTerms />
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
    </Layout>
  );
}
