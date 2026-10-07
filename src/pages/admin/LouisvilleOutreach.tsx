import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  Mail,
  MapPin,
  Send,
  Ticket,
  Users,
  Wallet,
} from "lucide-react";
import { Helmet } from "react-helmet-async";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import BOFEmailPreview from "@/components/admin/BOFEmailPreview";
import { useAuth, isAdmin } from "@/lib/auth";
import { adminFetch } from "@/lib/serverAuth";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type Contact = {
  id: string;
  email: string;
  name: string;
  company: string;
  discount_code: string;
  email_status: string | null;
  coupon_used: boolean;
  error_message?: string;
};
type Parsed = {
  contacts: Pick<Contact, "email" | "name" | "company">[];
  errors: string[];
  duplicates: number;
};
type WalletState = {
  ready: boolean;
  reason?: string;
  expiresAt?: string;
  passTypeIdentifier?: string;
};
type Data = {
  contacts: Contact[];
  total: number;
  wallet: WalletState;
  preview: boolean;
  email: { subject: string; html: string };
};
async function request(action: string, payload?: unknown, query = "") {
  const response = await adminFetch(
    `/.netlify/functions/admin-louisville-outreach?action=${action}${query}`,
    {
      method: payload === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json" },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    },
  );
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Please retry.");
  return result;
}
function downloadText(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function LouisvilleOutreach() {
  const { user, loading } = useAuth();
  const [tab, setTab] = useState<"email" | "contacts" | "wallet">("email");
  const [data, setData] = useState<Data | null>(null),
    [email, setEmail] = useState<Data["email"] | null>(null);
  const [name, setName] = useState("Bob"),
    [company, setCompany] = useState("");
  const [source, setSource] = useState(""),
    [parsed, setParsed] = useState<Parsed | null>(null);
  const [selected, setSelected] = useState<string[]>([]),
    [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [search, setSearch] = useState(""),
    [page, setPage] = useState(0),
    [certificate, setCertificate] = useState<File | null>(null);
  const refresh = async () => {
    const next = (await request(
      "list",
      undefined,
      `&page=${page}&search=${encodeURIComponent(search)}`,
    )) as Data;
    setData(next);
    setEmail((current) => current || next.email);
  };
  useEffect(() => {
    if (isAdmin(user)) {
      const timer = setTimeout(() => {
        refresh().catch((e) => setError(e.message));
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [user?.id, page, search]);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please retry.");
    } finally {
      setBusy(false);
    }
  };
  const preview = async (contact?: Contact) => {
    await run(async () => {
      const next = await request("preview", {
        name: contact?.name ?? name,
        company: contact?.company ?? company,
        code: contact?.discount_code,
      });
      setEmail(next.email);
      setTab("email");
    });
  };
  const selectedContacts =
    data?.contacts.filter((c) => selected.includes(c.id)) || [];
  const send = async () => {
    setConfirm(false);
    await run(async () => {
      let sent = 0,
        other = 0;
      for (const contact of selectedContacts) {
        const result = await request("send", { id: contact.id, confirm: true });
        if (result.status === "sent") sent++;
        else other++;
        setMessage(
          `Sending invitations: ${sent + other} of ${selectedContacts.length} checked. Keep this page open.`,
        );
      }
      setSelected([]);
      await refresh();
      setMessage(
        `${sent} invitation${sent === 1 ? "" : "s"} accepted for delivery.${other ? ` ${other} skipped or unconfirmed; check their status below.` : ""}`,
      );
    });
  };
  if (loading)
    return (
      <Layout>
        <div className="p-8">Loading admin…</div>
      </Layout>
    );
  if (!isAdmin(user))
    return (
      <Layout>
        <div className="mx-auto max-w-xl p-8">
          <h1 className="text-2xl font-bold">Admin sign-in required</h1>
          <Link to="/admin/setup" className="text-blue-700 underline">
            Sign in to admin
          </Link>
        </div>
      </Layout>
    );
  return (
    <Layout>
      <Helmet>
        <title>Louisville Outreach | BOF Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <Link
          to="/admin/orders"
          className="mb-5 inline-flex items-center gap-2 text-sm text-slate-600"
        >
          <ArrowLeft size={16} />
          Back to admin
        </Link>
        <div className="overflow-hidden rounded-2xl bg-[#122641] px-6 py-7 text-white sm:px-8">
          <div className="mb-3 flex items-center gap-2 text-xs font-bold tracking-[0.2em] text-orange-300">
            <MapPin size={15} /> LOUISVILLE, KENTUCKY
          </div>
          <h1 className="text-3xl font-bold sm:text-4xl">
            A little local love.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
            Invite our neighbors to try Banners On The Fly. A personal email,
            25% off their next banner, and a coupon they can keep in Apple
            Wallet.
          </p>
          <div className="mt-5 flex flex-wrap gap-3 text-xs font-semibold">
            <span className="rounded-full bg-white/10 px-3 py-2">
              25% off · One use per recipient
            </span>
            <span className="rounded-full bg-white/10 px-3 py-2">
              Free next-day air after production
            </span>
            <span className="rounded-full bg-orange-500 px-3 py-2 text-white">
              No expiration
            </span>
          </div>
        </div>
        {error && (
          <div
            role="alert"
            className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            {error}
            <button className="ml-3 underline" onClick={() => run(refresh)}>
              Retry
            </button>
          </div>
        )}
        {message && (
          <p
            role="status"
            className="mt-5 rounded-xl bg-green-50 p-4 text-sm text-green-900"
          >
            {message}
          </p>
        )}
        {data?.preview && (
          <p className="mt-4 rounded-lg bg-amber-50 p-4 text-sm">
            Preview mode: review the email here. Imports, Wallet setup and
            sending are available in production admin.
          </p>
        )}
        <div
          className="my-6 flex flex-wrap gap-2 rounded-xl bg-slate-100 p-1.5"
          role="tablist"
          aria-label="Louisville outreach"
        >
          {(
            [
              ["email", Mail, "Email preview"],
              ["contacts", Users, `Contacts${data ? ` (${data.total})` : ""}`],
              ["wallet", Wallet, "Apple Wallet"],
            ] as const
          ).map(([id, Icon, label]) => (
            <button
              role="tab"
              aria-selected={tab === id}
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold ${tab === id ? "bg-white text-[#18448d] shadow-sm" : "text-slate-600"}`}
            >
              <Icon size={17} />
              {label}
              {id === "wallet" && data && (
                <span
                  className={`h-2 w-2 rounded-full ${data.wallet.ready ? "bg-green-500" : "bg-amber-500"}`}
                />
              )}
            </button>
          ))}
        </div>
        {!data && !error && (
          <p className="py-8 text-slate-500">
            Loading your outreach workspace…
          </p>
        )}
        {tab === "email" && (
          <div className="grid items-start gap-6 lg:grid-cols-[320px_1fr]">
            <section className="rounded-2xl border bg-white p-6">
              <h2 className="text-lg font-bold text-[#122641]">
                Make it personal
              </h2>
              <p className="my-3 text-sm leading-6 text-slate-500">
                Try a name and company below. Each imported contact receives
                their own code and the same branded design.
              </p>
              <label
                className="mt-5 block text-sm font-medium"
                htmlFor="preview-name"
              >
                Recipient name
              </label>
              <Input
                id="preview-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-2"
                placeholder="Leave blank for a friendly greeting"
              />
              <label
                className="mt-4 block text-sm font-medium"
                htmlFor="preview-company"
              >
                Company (optional)
              </label>
              <Input
                id="preview-company"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="mt-2"
              />
              <Button
                className="mt-5 w-full bg-[#18448d]"
                disabled={busy}
                onClick={() => preview()}
              >
                Update preview
              </Button>
              <div className="mt-6 border-t pt-5 text-sm leading-6 text-slate-500">
                <p>
                  <Check size={15} className="mr-1 inline text-green-600" />
                  Name in subject and greeting
                </p>
                <p>
                  <Check size={15} className="mr-1 inline text-green-600" />
                  Personal coupon and designer link
                </p>
                <p>
                  <Check size={15} className="mr-1 inline text-green-600" />
                  Unsubscribe and delivery tracking
                </p>
              </div>
              <p className="mt-5 text-xs leading-5 text-slate-500">
                Preview only. No email is sent from this screen.
              </p>
              <Button
                variant="outline"
                className="mt-4 w-full"
                onClick={() => setTab("contacts")}
              >
                Add your contact list →
              </Button>
            </section>
            {email && (
              <BOFEmailPreview
                {...email}
                title="Louisville invitation preview"
              />
            )}
          </div>
        )}
        {tab === "contacts" && (
          <div className="space-y-6">
            <section className="rounded-2xl border bg-white p-6">
              <h2 className="text-xl font-bold text-[#122641]">
                Import your Louisville list
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                Upload a CSV or paste from a spreadsheet. Use Email, Name and
                Company columns, or one email per line. Up to 250 contacts per
                import.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-4">
                <label className="text-sm font-semibold">
                  CSV file
                  <input
                    type="file"
                    accept=".csv,.tsv,text/csv,text/tab-separated-values"
                    className="ml-3 max-w-full text-sm"
                    disabled={busy}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        if (file.size > 150000) {
                          setError("Import up to 250 contacts at a time.");
                          return;
                        }
                        file
                          .text()
                          .then((text) => {
                            setSource(text);
                            setParsed(null);
                          })
                          .catch(() => setError("The CSV could not be read."));
                      }
                    }}
                  />
                </label>
                <button
                  className="text-sm text-blue-700 underline"
                  onClick={() =>
                    downloadText(
                      "Email,Name,Company\n",
                      "BOF-Louisville-Contacts.csv",
                    )
                  }
                >
                  Download CSV template
                </button>
              </div>
              <label
                htmlFor="contact-list"
                className="mt-5 block text-sm font-semibold"
              >
                Paste contacts
              </label>
              <textarea
                id="contact-list"
                value={source}
                onChange={(e) => {
                  setSource(e.target.value);
                  setParsed(null);
                }}
                placeholder={
                  "Email,Name,Company\nbob@example.com,Bob,Example Company"
                }
                className="mt-2 min-h-36 w-full rounded-lg border p-3 font-mono text-sm"
              />
              <Button
                disabled={busy || !source.trim()}
                variant="outline"
                className="mt-3"
                onClick={() =>
                  run(async () =>
                    setParsed(await request("parse", { text: source })),
                  )
                }
              >
                Review import
              </Button>
              {parsed && (
                <div className="mt-5 rounded-xl bg-slate-50 p-4">
                  <p className="font-semibold">
                    {parsed.contacts.length} valid contacts ·{" "}
                    {parsed.duplicates} duplicates removed
                  </p>
                  {parsed.errors.length > 0 && (
                    <div className="mt-2 text-sm text-red-700">
                      {parsed.errors.map((x) => (
                        <p key={x}>{x}</p>
                      ))}
                      <p className="mt-2">
                        Correct these rows before importing.
                      </p>
                    </div>
                  )}
                  <div className="mt-3 max-h-56 overflow-auto text-sm">
                    {parsed.contacts.map((c) => (
                      <p key={c.email} className="border-b py-2">
                        {c.name || "No name"} · {c.email}
                        {c.company ? ` · ${c.company}` : ""}
                      </p>
                    ))}
                  </div>
                  <Button
                    className="mt-4 bg-[#c94e00]"
                    disabled={
                      busy ||
                      data?.preview ||
                      !parsed.contacts.length ||
                      parsed.errors.length > 0
                    }
                    onClick={() =>
                      run(async () => {
                        const result = await request("import", {
                          contacts: parsed.contacts,
                        });
                        setMessage(
                          `${result.imported} contacts saved. ${result.existing} already in your list. No emails sent.`,
                        );
                        setSource("");
                        setParsed(null);
                        await refresh();
                      })
                    }
                  >
                    Save contacts & create coupons
                  </Button>
                </div>
              )}
            </section>
            <section className="overflow-hidden rounded-2xl border bg-white">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b p-5">
                <div>
                  <h2 className="text-xl font-bold text-[#122641]">
                    Your invitations
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Choose up to 20 recipients. Previously sent invitations are
                    protected against duplicates.
                  </p>
                </div>
                <Input
                  aria-label="Search contacts"
                  placeholder="Search name, company or email"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(0);
                    setSelected([]);
                  }}
                  className="max-w-xs"
                />
              </div>
              {!data?.wallet.ready && (
                <div className="bg-amber-50 px-5 py-3 text-sm text-amber-900">
                  Finish{" "}
                  <button
                    className="font-semibold underline"
                    onClick={() => setTab("wallet")}
                  >
                    Apple Wallet setup
                  </button>{" "}
                  before sending invitations with a Wallet coupon.
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="p-4">Select</th>
                      <th className="p-4">Recipient</th>
                      <th className="p-4">Company</th>
                      <th className="p-4">Status</th>
                      <th className="p-4">Preview</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.contacts.map((c) => (
                      <tr key={c.id} className="border-t">
                        <td className="p-4">
                          <input
                            type="checkbox"
                            aria-label={`Select ${c.email}`}
                            checked={selected.includes(c.id)}
                            disabled={
                              busy ||
                              c.coupon_used ||
                              !["error", null].includes(c.email_status) ||
                              (!selected.includes(c.id) &&
                                selected.length >= 20)
                            }
                            onChange={(e) =>
                              setSelected((ids) =>
                                e.target.checked
                                  ? [...ids, c.id]
                                  : ids.filter((id) => id !== c.id),
                              )
                            }
                          />
                        </td>
                        <td className="p-4">
                          <p className="font-semibold">
                            {c.name || "Louisville neighbor"}
                          </p>
                          <p className="text-slate-500">{c.email}</p>
                        </td>
                        <td className="p-4 text-slate-600">
                          {c.company || "—"}
                        </td>
                        <td className="p-4">
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs">
                            {c.email_status || "Draft"}
                          </span>
                          {c.coupon_used && (
                            <p className="mt-2 text-xs">
                              Coupon used / reserved
                            </p>
                          )}
                          {c.error_message && (
                            <p className="mt-2 max-w-xs text-xs text-red-700">
                              {c.error_message}
                            </p>
                          )}
                        </td>
                        <td className="p-4">
                          <button
                            disabled={busy}
                            className="font-semibold text-blue-700 underline"
                            onClick={() => preview(c)}
                          >
                            View email
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {data?.contacts.length === 0 && (
                <div className="px-6 py-12 text-center">
                  <Users className="mx-auto mb-3 text-slate-300" size={34} />
                  <p className="font-semibold text-slate-700">
                    Your next customers start here.
                  </p>
                  <p className="mt-2 text-sm text-slate-500">
                    Add your list above to prepare their invitations.
                  </p>
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t p-5">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    disabled={busy || page === 0}
                    onClick={() => {
                      setPage((p) => p - 1);
                      setSelected([]);
                    }}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy || (page + 1) * 100 >= (data?.total || 0)}
                    onClick={() => {
                      setPage((p) => p + 1);
                      setSelected([]);
                    }}
                  >
                    Next
                  </Button>
                </div>
                <Button
                  className="bg-[#c94e00]"
                  disabled={
                    busy ||
                    !selected.length ||
                    !data?.wallet.ready ||
                    data.preview
                  }
                  onClick={() => setConfirm(true)}
                >
                  <Send size={16} className="mr-2" />
                  Review & send ({selected.length})
                </Button>
              </div>
            </section>
          </div>
        )}
        {tab === "wallet" && (
          <section className="grid gap-6 rounded-2xl border bg-white p-6 lg:grid-cols-[1fr_350px]">
            <div>
              <div className="flex items-center gap-3">
                <Wallet className="text-[#18448d]" />
                <h2 className="text-xl font-bold text-[#122641]">
                  Apple Wallet setup
                </h2>
              </div>
              <p
                className={`mt-4 rounded-lg p-3 text-sm ${data?.wallet.ready ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-900"}`}
              >
                {data?.wallet.ready
                  ? `Ready · Certificate expires ${new Date(data.wallet.expiresAt!).toLocaleDateString()}`
                  : data?.wallet.reason ||
                    "Apple Pass Type ID certificate needed"}
              </p>
              <p className="mt-4 text-sm leading-6 text-slate-600">
                Apple requires a Pass Type ID certificate from your Apple
                Developer account. Once connected, every invitation gets a real,
                signed coupon that opens in Apple Wallet.
              </p>
              <ol className="mt-5 list-decimal space-y-6 pl-5 text-sm leading-6">
                <li>
                  <strong>Download your certificate request.</strong>
                  <p>The signing key stays encrypted on the server.</p>
                  <Button
                    variant="outline"
                    disabled={busy || data?.preview}
                    className="mt-2"
                    onClick={() =>
                      run(async () => {
                        const result = await request("certificate-request", {});
                        downloadText(
                          result.csr,
                          "BannersOnTheFly.certSigningRequest",
                        );
                        setMessage(
                          "Certificate request downloaded. Upload it when Apple asks for a CSR.",
                        );
                      })
                    }
                  >
                    <Download size={16} className="mr-2" />
                    Download certificate request
                  </Button>
                </li>
                <li>
                  <strong>Create the certificate with Apple.</strong>
                  <p>
                    Register a Pass Type ID (for example,
                    pass.com.bannersonthefly.coupon), then create its Pass Type
                    ID Certificate using the downloaded request.
                  </p>
                  <a
                    href="https://developer.apple.com/help/account/capabilities/create-wallet-identifiers-and-certificates"
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-700 underline"
                  >
                    Open Apple’s step-by-step instructions ↗
                  </a>
                </li>
                <li>
                  <strong>Upload Apple’s certificate.</strong>
                  <p>
                    Choose the .cer file Apple gives you. We verify it before
                    activating Wallet.
                  </p>
                  <input
                    aria-label="Apple Pass Type ID certificate"
                    type="file"
                    accept=".cer,.pem"
                    className="mt-3 block max-w-full text-sm"
                    disabled={busy}
                    onChange={(e) =>
                      setCertificate(e.target.files?.[0] || null)
                    }
                  />
                  <Button
                    className="mt-3 bg-[#18448d]"
                    disabled={busy || !certificate || data?.preview}
                    onClick={() =>
                      run(async () => {
                        if (!certificate || certificate.size > 30000)
                          throw Error(
                            "Choose a certificate smaller than 30 KB.",
                          );
                        const bytes = new Uint8Array(
                          await certificate.arrayBuffer(),
                        );
                        let raw = "";
                        bytes.forEach((b) => (raw += String.fromCharCode(b)));
                        await request("certificate", {
                          certificate: btoa(raw),
                        });
                        setCertificate(null);
                        await refresh();
                        setMessage(
                          "Apple Wallet is ready. Your invitations can now include a signed coupon.",
                        );
                      })
                    }
                  >
                    Connect Apple Wallet
                  </Button>
                </li>
              </ol>
            </div>
            <div className="self-start">
              <div className="overflow-hidden rounded-3xl bg-[#122641] text-white shadow-xl">
                <div className="flex justify-between px-6 py-5 text-xs font-semibold">
                  <span>Banners On The Fly</span>
                  <span className="text-orange-300">LOUISVILLE</span>
                </div>
                <div className="bg-[#1b3657] px-6 py-7">
                  <p className="text-[10px] font-bold tracking-[0.2em] text-orange-300">
                    A LITTLE LOCAL LOVE
                  </p>
                  <p className="mt-3 text-6xl font-black tracking-tight">
                    25% OFF
                  </p>
                  <p className="mt-2 text-sm tracking-wide">YOUR NEXT BANNER</p>
                </div>
                <div className="space-y-5 px-6 py-6">
                  <div>
                    <p className="text-[10px] font-bold tracking-widest text-orange-300">
                      PLUS FREE SHIPPING
                    </p>
                    <p className="mt-1 text-lg">Next-Day Air</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold tracking-widest text-orange-300">
                      SAVE IT FOR LATER
                    </p>
                    <p className="mt-1 text-sm">No expiration · One use</p>
                  </div>
                  <div className="border-t border-white/20 pt-5 text-center">
                    <Ticket size={40} className="mx-auto text-orange-300" />
                    <p className="mt-3 text-xs text-slate-300">
                      Each pass includes the recipient’s code
                      <br />
                      and a QR link to use their coupon.
                    </p>
                  </div>
                </div>
              </div>
              <p className="mt-3 text-center text-xs text-slate-500">
                Pass design preview. Apple controls the final Wallet layout.
              </p>
            </div>
          </section>
        )}
        <Dialog open={confirm} onOpenChange={setConfirm}>
          <DialogContent>
            <DialogTitle>Send these Louisville invitations?</DialogTitle>
            <DialogDescription>
              Each recipient receives a personalized email, a single-use 25%
              code, and an Apple Wallet coupon.
            </DialogDescription>
            <div className="max-h-64 overflow-auto text-sm">
              {selectedContacts.map((c) => (
                <p key={c.id} className="border-b py-2">
                  {c.name ? `${c.name} · ` : ""}
                  {c.email}
                </p>
              ))}
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setConfirm(false)}>
                Cancel
              </Button>
              <Button className="bg-[#c94e00]" onClick={send}>
                Send {selectedContacts.length} invitations
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </Layout>
  );
}
