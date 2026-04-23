import express from "express";
import {
  buildPlaceholderPaymentUrl,
  createPaymentSummary,
  processSmsMessage,
} from "./conversationEngine.js";
import {
  getSession,
  SESSION_STATUSES,
  setSessionStatus,
  updateSession,
} from "./stateStore.js";

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const renderTextOrderPage = (sessionId) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Text Order Approval</title>
    <style>
      body { font-family: Arial, sans-serif; max-width: 760px; margin: 0 auto; padding: 24px; line-height: 1.45; }
      .card { border: 1px solid #ddd; border-radius: 12px; padding: 16px; margin-bottom: 16px; }
      .muted { color: #666; }
      .success { background: #ecfdf3; border: 1px solid #8dd6aa; padding: 12px; border-radius: 8px; }
      button { background: #111827; color: white; border: none; padding: 10px 14px; border-radius: 8px; cursor: pointer; }
      button[disabled] { opacity: .6; cursor: not-allowed; }
      input[type="file"] { margin: 8px 0 10px; }
      img { max-width: 100%; border-radius: 8px; border: 1px solid #ddd; }
      pre { background: #f7f7f8; padding: 12px; border-radius: 8px; overflow: auto; }
      .hidden { display: none; }
    </style>
  </head>
  <body>
    <h1>SMS Text Order</h1>
    <p class="muted">Session: <code>${escapeHtml(sessionId)}</code></p>

    <div class="card">
      <h2>Order Details</h2>
      <pre id="summary">Loading session…</pre>
    </div>

    <div class="card">
      <h2>Upload Artwork</h2>
      <p class="muted">Choose an image to preview, then save it to this SMS order session.</p>
      <input id="fileInput" type="file" accept="image/*" />
      <div id="previewWrap" class="hidden">
        <p><strong>Preview:</strong></p>
        <img id="previewImage" alt="Artwork preview" />
      </div>
      <button id="saveUploadBtn">Save Upload to Session</button>
      <p id="uploadMsg" class="muted"></p>
    </div>

    <div class="card">
      <h2>Approve Design</h2>
      <button id="approveBtn">Approve Design</button>
      <p class="muted">This will mark your session ready for payment in the SMS flow.</p>
      <div id="approvedState" class="success hidden">
        <h3>Design Approved</h3>
        <p>Your order is ready for payment.</p>
        <p>Return to your text conversation and reply <strong>PAY</strong> for your payment link.</p>
        <p id="paymentLinkWrap" class="hidden">
          <a id="paymentLink" href="#" target="_blank" rel="noreferrer">Continue to Payment</a>
        </p>
      </div>
    </div>

    <script>
      const sessionId = ${JSON.stringify(sessionId)};
      const summaryEl = document.getElementById("summary");
      const fileInput = document.getElementById("fileInput");
      const previewWrap = document.getElementById("previewWrap");
      const previewImage = document.getElementById("previewImage");
      const saveUploadBtn = document.getElementById("saveUploadBtn");
      const uploadMsg = document.getElementById("uploadMsg");
      const approveBtn = document.getElementById("approveBtn");
      const approvedState = document.getElementById("approvedState");
      const paymentLinkWrap = document.getElementById("paymentLinkWrap");
      const paymentLink = document.getElementById("paymentLink");

      let session = null;
      let selectedFileName = "";
      let previewRef = "";

      const loadSession = async () => {
        const response = await fetch("/api/text-order/" + sessionId);
        const payload = await response.json();
        session = payload.session;
        summaryEl.textContent = JSON.stringify(session, null, 2);

        if (session?.status === "awaiting_payment") {
          approvedState.classList.remove("hidden");
          if (session.paymentUrl) {
            paymentLinkWrap.classList.remove("hidden");
            paymentLink.href = session.paymentUrl;
          }
        }
      };

      fileInput.addEventListener("change", () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        selectedFileName = file.name;
        const objectUrl = URL.createObjectURL(file);
        previewRef = "preview://" + file.name + "-" + Date.now();
        previewImage.src = objectUrl;
        previewWrap.classList.remove("hidden");
      });

      saveUploadBtn.addEventListener("click", async () => {
        if (!selectedFileName) {
          uploadMsg.textContent = "Please pick a file first.";
          return;
        }
        saveUploadBtn.disabled = true;
        uploadMsg.textContent = "Saving upload…";
        const response = await fetch("/api/text-order/" + sessionId + "/upload", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            artworkRef: "artwork://" + selectedFileName + "-" + Date.now(),
            previewRef,
          }),
        });
        const payload = await response.json();
        session = payload.session;
        summaryEl.textContent = JSON.stringify(session, null, 2);
        uploadMsg.textContent = "Artwork saved to session.";
        saveUploadBtn.disabled = false;
      });

      approveBtn.addEventListener("click", async () => {
        approveBtn.disabled = true;
        const response = await fetch("/api/text-order/" + sessionId + "/approve", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            approvedArtworkRef: session?.artworkRef || null,
            approvedPreviewRef: session?.previewRef || null,
          }),
        });
        const payload = await response.json();
        session = payload.session;
        summaryEl.textContent = JSON.stringify(session, null, 2);
        approvedState.classList.remove("hidden");
        if (session.paymentUrl) {
          paymentLinkWrap.classList.remove("hidden");
          paymentLink.href = session.paymentUrl;
        }
        approveBtn.disabled = false;
      });

      loadSession().catch((error) => {
        summaryEl.textContent = "Failed to load session: " + error.message;
      });
    </script>
  </body>
</html>`;

export const createSmsApp = () => {
  const app = express();
  app.use(express.json());

  app.post("/sms", (req, res) => {
    const { message, userId } = req.body ?? {};

    if (typeof message !== "string" || typeof userId !== "string" || !userId.trim()) {
      return res.status(400).json({
        reply: "Invalid request. Send JSON with string fields: message and userId.",
      });
    }

    const reply = processSmsMessage({
      message,
      userId: userId.trim(),
    });

    return res.json({ reply });
  });

  app.get("/test", (req, res) => {
    const { message, userId = "browser-user" } = req.query;

    if (typeof message === "string" && typeof userId === "string" && userId.trim()) {
      const reply = processSmsMessage({
        message,
        userId: userId.trim(),
      });

      return res.json({ reply });
    }

    return res.json({
      reply:
        'SMS server is running. Try: /test?userId=123&message=banner or POST /sms with {"message":"banner","userId":"123"}',
    });
  });

  app.get("/text-order/:sessionId", (req, res) => {
    const { sessionId } = req.params;
    return res.type("html").send(renderTextOrderPage(sessionId));
  });

  app.get("/api/text-order/:sessionId", (req, res) => {
    const { sessionId } = req.params;
    const session = getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const paymentSummary = createPaymentSummary(session);
    return res.json({
      session: {
        ...session,
        readyForPayment: session.status === SESSION_STATUSES.AWAITING_PAYMENT,
      },
      readyForPayment: session.status === SESSION_STATUSES.AWAITING_PAYMENT,
      paymentSummary,
    });
  });

  app.post("/api/text-order/:sessionId/status", (req, res) => {
    const { sessionId } = req.params;
    const { status } = req.body ?? {};
    if (typeof status !== "string" || !status.trim()) {
      return res.status(400).json({ error: "status is required" });
    }

    const updated = setSessionStatus(sessionId, status.trim());
    if (!updated) {
      return res.status(404).json({ error: "Session not found" });
    }

    return res.json({ session: updated });
  });

  app.post("/api/text-order/:sessionId/upload", (req, res) => {
    const { sessionId } = req.params;
    const { artworkRef, previewRef } = req.body ?? {};
    const existing = getSession(sessionId);
    if (!existing) {
      return res.status(404).json({ error: "Session not found" });
    }

    const updated = updateSession(sessionId, {
      artworkRef: typeof artworkRef === "string" && artworkRef.trim() ? artworkRef.trim() : existing.artworkRef,
      previewRef: typeof previewRef === "string" && previewRef.trim() ? previewRef.trim() : existing.previewRef,
      status: SESSION_STATUSES.UPLOADED,
    });
    return res.json({ session: updated });
  });

  app.post("/api/text-order/:sessionId/approve", (req, res) => {
    const { sessionId } = req.params;
    const { approvedArtworkRef, approvedPreviewRef } = req.body ?? {};
    const existing = getSession(sessionId);
    if (!existing) {
      return res.status(404).json({ error: "Session not found" });
    }

    const approvedAt = new Date().toISOString();

    const designApprovedSession = updateSession(sessionId, {
      status: SESSION_STATUSES.DESIGN_APPROVED,
      approvedArtworkRef:
        typeof approvedArtworkRef === "string" && approvedArtworkRef.trim()
          ? approvedArtworkRef.trim()
          : existing.artworkRef,
      approvedPreviewRef:
        typeof approvedPreviewRef === "string" && approvedPreviewRef.trim()
          ? approvedPreviewRef.trim()
          : existing.previewRef,
      approvedAt,
    });

    const paymentUrl = designApprovedSession.paymentUrl || buildPlaceholderPaymentUrl(designApprovedSession);
    const awaitingPaymentSession = updateSession(sessionId, {
      status: SESSION_STATUSES.AWAITING_PAYMENT,
      readyForPayment: true,
      paymentStatus: designApprovedSession.paymentStatus || "pending",
      paymentUrl,
    });

    const paymentSummary = createPaymentSummary(awaitingPaymentSession);
    return res.json({
      session: awaitingPaymentSession,
      readyForPayment: true,
      paymentSummary,
    });
  });

  app.post("/api/text-order/:sessionId/payment-link", (req, res) => {
    const { sessionId } = req.params;
    const { paymentUrl, paymentStatus } = req.body ?? {};
    const existing = getSession(sessionId);
    if (!existing) {
      return res.status(404).json({ error: "Session not found" });
    }

    const updated = updateSession(sessionId, {
      paymentUrl: typeof paymentUrl === "string" && paymentUrl.trim() ? paymentUrl.trim() : null,
      paymentStatus: typeof paymentStatus === "string" && paymentStatus.trim() ? paymentStatus.trim() : "pending",
    });
    return res.json({ session: updated });
  });

  app.get("/api/text-order/:sessionId/payment-summary", (req, res) => {
    const { sessionId } = req.params;
    const session = getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const paymentSummary = createPaymentSummary(session);
    return res.json({
      readyForPayment: session.status === SESSION_STATUSES.AWAITING_PAYMENT,
      paymentSummary,
      paymentUrl: session.paymentUrl,
      paymentStatus: session.paymentStatus ?? "pending",
    });
  });

  return app;
};
