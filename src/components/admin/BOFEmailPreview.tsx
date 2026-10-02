import { useEffect, useRef, useState } from "react";
import { Mail, Monitor, Smartphone } from "lucide-react";

export default function BOFEmailPreview({
  subject,
  html,
}: {
  subject: string;
  html: string;
}) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [height, setHeight] = useState(920);
  const frame = useRef<HTMLIFrameElement>(null);
  const observer = useRef<ResizeObserver | null>(null);
  useEffect(() => () => observer.current?.disconnect(), []);

  const preparePreview = () => {
    observer.current?.disconnect();
    const document = frame.current?.contentDocument;
    if (!document) return;
    // This is a visual preview, never an account-activation or unsubscribe flow.
    // Scripts remain sandboxed. Same-origin access only lets the parent measure
    // this trusted, server-rendered template and neutralize its links.
    document.querySelectorAll("a").forEach((link) => {
      link.removeAttribute("href");
      link.setAttribute("role", "link");
      link.setAttribute("aria-disabled", "true");
      link.tabIndex = -1;
      link.title = "Preview only — links are personalized when sent";
      link.style.cursor = "default";
    });
    const root = document.querySelector("[data-email-root]") || document.body;
    const resize = () =>
      setHeight(
        Math.max(120, Math.ceil(root.getBoundingClientRect().height) + 2),
      );
    resize();
    observer.current = new ResizeObserver(resize);
    observer.current.observe(root);
  };

  return (
    <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Mail size={16} aria-hidden="true" /> Customer email
        </div>
        <div
          className="flex rounded-lg bg-slate-100 p-1"
          role="group"
          aria-label="Email preview size"
        >
          {(
            [
              ["desktop", Monitor, "Desktop"],
              ["mobile", Smartphone, "Mobile"],
            ] as const
          ).map(([value, Icon, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={device === value}
              onClick={() => setDevice(value)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 ${device === value ? "bg-white text-[#18448d] shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
            >
              <Icon size={14} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="border-b border-slate-200 px-4 py-4 text-sm sm:px-5">
        <p className="text-xs text-slate-500">
          From{" "}
          <span className="font-medium text-slate-700">Banners On The Fly</span>
        </p>
        <p className="mt-1 font-semibold text-slate-900">{subject}</p>
      </div>
      <div className="bg-[#eef2f7]">
        <div
          className="mx-auto max-w-full"
          style={{ width: device === "mobile" ? 375 : 680 }}
        >
          <iframe
            ref={frame}
            title="BOF Cash invitation preview"
            sandbox="allow-same-origin"
            referrerPolicy="no-referrer"
            srcDoc={html}
            onLoad={preparePreview}
            className="block w-full border-0"
            style={{ height }}
            scrolling="no"
          />
        </div>
      </div>
      <p className="border-t border-slate-200 px-4 py-3 text-xs leading-5 text-slate-500 sm:px-5">
        Preview only. Each customer receives a personal activation link when you
        send their invitation.
      </p>
    </div>
  );
}
