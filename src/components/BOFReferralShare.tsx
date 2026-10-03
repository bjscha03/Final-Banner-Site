import { useEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
  Facebook,
  Mail,
  MessageCircle,
  RotateCcw,
  Share2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function BOFReferralShare({
  code,
  preview = false,
  channel,
  publicOrigin = "https://bannersonthefly.com",
  hasReceivedOrder = false,
  referralPath,
  testMode = false,
}: {
  code: string;
  preview?: boolean;
  channel?: string | null;
  publicOrigin?: string;
  hasReceivedOrder?: boolean;
  referralPath?: string;
  testMode?: boolean;
}) {
  let origin = "https://bannersonthefly.com";
  try {
    const candidate = new URL(publicOrigin);
    if (candidate.protocol === "https:" || candidate.protocol === "http:")
      origin = candidate.origin;
  } catch {
    // Keep the working public site as the fallback for incomplete configuration.
  }
  const path = referralPath?.startsWith("/bof-cash-test/share/") ? `/bof-cash-test/share/${encodeURIComponent(code)}` : `/refer/${encodeURIComponent(code)}`;
  const link = `${origin}${path}`;
  const initialMessage = testMode ? `[TEST — no real discount or reward]\nI’m testing BOF Cash sharing. This link and code ${code} belong only to an isolated test:\n${link}\n\nNo live payment or BOF Cash is involved.` : `${hasReceivedOrder ? "Hey! I recently ordered from Banners On The Fly, and the quality was great and shipping was super fast! If you need a banner, check them out!" : "Hey! If you need a banner, check out Banners On The Fly for great quality and super fast shipping!"} Use my code ${code} to save up to $25 on your first qualifying order:\n${link}`;
  const initialSubject = testMode ? "[TEST] BOF Cash referral sharing" : "Save on your next BOF order";
  const [message, setMessage] = useState(initialMessage);
  const [subject, setSubject] = useState(initialSubject);
  const edited = message !== initialMessage || subject !== initialSubject;
  useEffect(() => {
    setMessage(initialMessage);
    setSubject(initialSubject);
  }, [initialMessage]);
  const emailLink = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
  const isAppleDevice =
    typeof navigator !== "undefined" &&
    (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
  const textLink = `sms:${isAppleDevice ? "&" : "?"}body=${encodeURIComponent(message)}`;
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
      field.style.height = `${field.scrollHeight + field.offsetHeight - field.clientHeight}px`;
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
        title: subject,
        text: message
          .replace(link, "")
          .replace(/\n{3,}/g, "\n\n")
          .trim(),
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
      <div className="border-b border-slate-100 bg-gradient-to-br from-blue-50 via-white to-orange-50 px-5 py-6 sm:px-6">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#18448d]">
          <Check size={16} aria-hidden="true" /> {testMode ? "Your isolated test code is ready" : "Your referral code is ready"}
        </p>
        <h2 className="mt-2 text-2xl font-bold text-[#122641]">
          Good things are worth sharing.
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {testMode ? <>Isolated sharing test. The buttons open real share drafts, but this code provides no live discount or reward.</> : <>You earn{" "}
          <strong className="text-slate-900">$5–$10 in BOF Cash.</strong> Your
          friend saves <strong className="text-slate-900">up to $25</strong> on
          a qualifying first order.</>}
        </p>
      </div>
      <div className="space-y-5 p-5 sm:p-6">
        {selectedLabel && (
          <p className="rounded-lg bg-blue-50 p-3 text-sm text-[#18448d]">
            Your link is ready. Choose <strong>{selectedLabel}</strong> below to
            send it.
          </p>
        )}
        <div className="space-y-3">
          <p className="text-sm leading-6 text-slate-600">
            {testMode ? "Choose how to share. Your isolated test link is already included—you review it before posting or sending." : "Choose how to share. Your referral offer is already included—you review it before posting or sending."}
          </p>
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
          <p className="text-xs leading-5 text-slate-500">
            Facebook opens with your referral link attached; add a caption if
            you like. Text and email open with the message below filled in.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <label
              htmlFor="bof-share-message"
              className="text-sm font-semibold text-slate-800"
            >
              Your ready-to-send message
            </label>
            {edited && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-[#18448d]"
                onClick={() => {
                  setMessage(initialMessage);
                  setSubject(initialSubject);
                }}
              >
                <RotateCcw size={14} className="mr-1.5" aria-hidden="true" />
                Reset message
              </Button>
            )}
          </div>
          <p
            id="bof-message-help"
            className="mb-3 text-xs leading-5 text-slate-500"
          >
            Make it sound like you, or send it as is. Your code and link are
            already here.
          </p>
          <Textarea
            ref={messageInput}
            id="bof-share-message"
            value={message}
            aria-describedby="bof-message-help"
            onChange={(event) => setMessage(event.target.value)}
            className="min-h-32 resize-none overflow-hidden border-slate-200 bg-white p-3 text-base leading-6 shadow-none sm:text-sm"
          />
          <div className="mt-4">
            <label
              htmlFor="bof-email-subject"
              className="text-xs font-semibold text-slate-700"
            >
              Email subject
            </label>
            <Input
              id="bof-email-subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              className="mt-1.5 bg-white text-base sm:text-sm"
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs leading-5 text-slate-500">
              No photo or public post is required.
            </p>
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
        </div>
        <div className="border-t border-slate-100 pt-4">
          <Button
            variant="ghost"
            className="mb-4 text-[#18448d]"
            onClick={share}
          >
            <Share2 size={16} className="mr-2" aria-hidden="true" />
            More sharing options
          </Button>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Or share your link or code anywhere
          </p>
          <div className="space-y-4">
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
                {testMode ? "Your isolated test code" : "Your code for checkout"}
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
          </div>
        </div>
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
