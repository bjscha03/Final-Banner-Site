import { useEffect, useRef, useState } from "react";
import { Copy, Facebook, Mail, MessageCircle, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function BOFReferralShare({
  code,
  preview = false,
  channel,
}: {
  code: string;
  preview?: boolean;
  channel?: string | null;
}) {
  const link = `https://bannersonthefly.com/refer/${code}`;
  const message = `Need banners, yard signs, or car magnets? Save up to $25 on your first qualifying Banners On The Fly order with my link. I earn BOF Cash if your order qualifies.\n${link}`;
  const emailLink = `mailto:?subject=${encodeURIComponent("A deal for your next banner or signs")}&body=${encodeURIComponent(message)}`;
  const textLink = `sms:${/iPad|iPhone|iPod/.test(navigator.userAgent) ? "&" : "?"}body=${encodeURIComponent(message)}`;
  const selectedLabel =
    channel === "facebook"
      ? "Share on Facebook"
      : channel === "text"
        ? "Text a friend"
        : channel === "email"
          ? "Email a friend"
          : "";
  const [notice, setNotice] = useState("");
  const linkInput = useRef<HTMLInputElement>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const messageInput = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const fitMessage = () => {
      const field = messageInput.current;
      if (!field) return;
      field.style.height = "auto";
      field.style.height = `${field.scrollHeight}px`;
    };
    fitMessage();
    window.addEventListener("resize", fitMessage);
    return () => window.removeEventListener("resize", fitMessage);
  }, [message]);
  const previewNotice = () =>
    setNotice(
      "This is a preview. Customers receive their own working referral link and code after activation.",
    );
  const copy = async (
    text: string,
    label: string,
    input: HTMLInputElement | HTMLTextAreaElement | null,
  ) => {
    if (preview) return previewNotice();
    try {
      await navigator.clipboard.writeText(text);
      setNotice(`${label} copied.`);
    } catch {
      input?.focus();
      input?.select();
      setNotice(
        `Automatic copying isn't available. Your ${label.toLowerCase()} is selected—copy it from the field.`,
      );
    }
  };
  const share = async () => {
    if (preview) return previewNotice();
    if (!navigator.share) {
      await copy(message, "Message and link", messageInput.current);
      return;
    }
    try {
      await navigator.share({
        title: "Save with Banners On The Fly",
        text: message.slice(0, message.lastIndexOf("\n")),
        url: link,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setNotice(
        "Sharing couldn't open. Copy your link or message below instead.",
      );
    }
  };
  return (
    <section
      id="share"
      aria-label="Share BOF and earn rewards"
      className="scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#18448d]">
          <Share2 size={16} aria-hidden="true" /> Your referrals
        </p>
        <h2 className="mt-2 text-2xl font-bold text-[#122641]">
          Share with a friend.
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          You earn{" "}
          <strong className="text-slate-900">$5–$10 in BOF Cash.</strong> Your
          friend saves <strong className="text-slate-900">up to $25</strong> on
          a qualifying first order.
        </p>
      </div>
      <div className="space-y-5 p-5 sm:p-6">
        {selectedLabel && (
          <p className="rounded-lg bg-blue-50 p-3 text-sm text-[#18448d]">
            Your link is ready. Choose <strong>{selectedLabel}</strong> below to
            send it.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <Button
            asChild
            className="h-12 bg-[#1877f2] text-white hover:bg-[#1264cf]"
          >
            <a
              href={
                preview
                  ? undefined
                  : `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`
              }
              role="link"
              aria-disabled={preview || undefined}
              target={preview ? undefined : "_blank"}
              rel="noopener noreferrer"
              onClick={(event) => {
                if (preview) {
                  event.preventDefault();
                  previewNotice();
                }
              }}
            >
              <Facebook size={18} className="mr-2" aria-hidden="true" />
              Share on Facebook
            </a>
          </Button>
          <Button asChild variant="outline" className="h-12">
            <a
              href={preview ? undefined : textLink}
              role="link"
              aria-disabled={preview || undefined}
              onClick={(event) => {
                if (preview) {
                  event.preventDefault();
                  previewNotice();
                }
              }}
            >
              <MessageCircle size={18} className="mr-2" aria-hidden="true" />
              Text a friend
            </a>
          </Button>
          <Button asChild variant="outline" className="h-12">
            <a
              href={preview ? undefined : emailLink}
              role="link"
              aria-disabled={preview || undefined}
              onClick={(event) => {
                if (preview) {
                  event.preventDefault();
                  previewNotice();
                }
              }}
            >
              <Mail size={18} className="mr-2" aria-hidden="true" />
              Email a friend
            </a>
          </Button>
        </div>
        <div>
          <label
            htmlFor="bof-link"
            className="text-sm font-semibold text-slate-800"
          >
            Your referral link
          </label>
          <div className="mt-2 flex min-w-0 gap-2">
            <Input
              ref={linkInput}
              id="bof-link"
              readOnly
              value={link}
              className="min-w-0 bg-slate-50 text-xs sm:text-sm"
              onFocus={(e) => e.target.select()}
            />
            <Button
              variant="outline"
              className="shrink-0"
              onClick={() => copy(link, "Referral link", linkInput.current)}
            >
              <Copy size={15} className="mr-2" aria-hidden="true" />
              Copy link
            </Button>
          </div>
        </div>
        <div>
          <label
            htmlFor="bof-code"
            className="text-sm font-semibold text-slate-800"
          >
            Or give them your code at checkout
          </label>
          <div className="mt-2 flex min-w-0 gap-2">
            <Input
              ref={codeInput}
              id="bof-code"
              readOnly
              value={code}
              className="min-w-0 bg-slate-50 font-mono text-xs sm:text-sm"
              onFocus={(e) => e.target.select()}
            />
            <Button
              variant="outline"
              className="shrink-0"
              onClick={() => copy(code, "Referral code", codeInput.current)}
            >
              <Copy size={15} className="mr-2" aria-hidden="true" />
              Copy code
            </Button>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <label
              htmlFor="bof-share-message"
              className="text-sm font-semibold text-slate-800"
            >
              A message ready to share
            </label>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-[#18448d]"
              onClick={() =>
                copy(message, "Message and link", messageInput.current)
              }
            >
              <Copy size={14} className="mr-1.5" aria-hidden="true" />
              Copy message
            </Button>
          </div>
          <Textarea
            ref={messageInput}
            id="bof-share-message"
            readOnly
            value={message}
            className="resize-none overflow-hidden border-0 bg-transparent p-0 text-sm leading-6 shadow-none"
            onFocus={(e) => e.target.select()}
          />
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Paste this into a text, email, or your Facebook post. No photo or
            public post is required.
          </p>
        </div>
        <Button variant="ghost" className="text-[#18448d]" onClick={share}>
          <Share2 size={16} className="mr-2" aria-hidden="true" />
          More sharing options
        </Button>
        {notice && (
          <p
            role="status"
            className="rounded-lg bg-blue-50 p-3 text-sm leading-5 text-[#18448d]"
          >
            {notice}
          </p>
        )}
      </div>
    </section>
  );
}
