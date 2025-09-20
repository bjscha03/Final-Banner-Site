// netlify/functions/upload-file.js
import Busboy from "busboy";
import fs from "fs";
import path from "path";

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB
const TMP_DIR = "/tmp";

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { success: false, error: "Method Not Allowed" });
  }

  try {
    const bodyBuf = Buffer.from(
      event.body || "",
      event.isBase64Encoded ? "base64" : "utf8"
    );
    const bb = Busboy({ headers: event.headers || {} });

    let filePath = "";
    let fileName = "";
    let mime = "";
    let size = 0;

    // We'll capture the first few bytes to confirm "%PDF-"
    let sawMagic = false;
    let headerBuf = Buffer.alloc(0);

    const done = new Promise((resolve, reject) => {
      bb.on("file", (field, stream, info) => {
        if (!["file", "pdf"].includes(field)) {
          // Ignore unknown fields
          stream.resume();
          return;
        }

        fileName = info.filename || "upload.pdf";
        mime = info.mimeType || info.mime || "";

        // Create a temp path
        const safeName = fileName.replace(/[^\w.\-]+/g, "_");
        filePath = path.join(TMP_DIR, `${Date.now()}_${safeName}`);
        const out = fs.createWriteStream(filePath);

        stream.on("data", (chunk) => {
          size += chunk.length;
          if (size > MAX_BYTES) {
            stream.destroy(new Error("MAX_SIZE"));
            return;
          }

          // Accumulate header bytes until we can check magic
          if (!sawMagic) {
            headerBuf = Buffer.concat([headerBuf, chunk]);
            if (headerBuf.length >= 5) {
              // PDF files start with "%PDF-"
              sawMagic = headerBuf.slice(0, 5).toString() === "%PDF-";
            }
          }

          out.write(chunk);
        });

        stream.on("end", () => out.end());
        stream.on("error", reject);
        out.on("error", reject);
        out.on("finish", () => resolve());
      });

      bb.on("error", reject);
      bb.on("finish", () => {
        // If no file field seen, still resolve; we check below.
        if (!fileName) resolve();
      });
    });

    bb.end(bodyBuf);
    await done;

    if (!fileName) return json(400, { success: false, error: "No file provided. Use field name 'file'." });

    // Accept common PDF MIME or octet-stream, but *verify magic bytes*
    const mimeLooksOk =
      /^application\/pdf$/i.test(mime) || /^application\/octet-stream$/i.test(mime);

    if (!mimeLooksOk || !sawMagic) {
      // Clean up temp file if created
      try { if (filePath) fs.unlinkSync(filePath); } catch (_) {}
      return json(400, {
        success: false,
        error: `Not a valid PDF (mime="${mime || "unknown"}", magic=${sawMagic})`,
      });
    }

    // TODO: upload the file at filePath to your storage (S3/Cloudinary/etc.)
    // and produce a public URL. For now, we just report success + stats.
    const result = { success: true, filename: fileName, size, mime };

    // Remove temp file if you uploaded elsewhere. If you keep it, leave it.
    try { fs.unlinkSync(filePath); } catch (_) {}

    return json(200, result);
  } catch (e) {
    const msg = e?.message || String(e);
    const status = msg === "MAX_SIZE" ? 400 : 500;
    return json(status, { success: false, error: msg });
  }
};

function json(status, body) {
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Origin, Content-Type, Accept",
    },
    body: JSON.stringify(body),
  };
}