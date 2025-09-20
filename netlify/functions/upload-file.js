// netlify/functions/upload-file.js
import Busboy from "busboy";

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { success: false, error: "Method Not Allowed" });
  }

  try {
    const bodyBuf = Buffer.from(event.body || "", event.isBase64Encoded ? "base64" : "utf8");
    const bb = Busboy({ headers: event.headers || {} });

    let fileName = "";
    let mime = "";
    let size = 0;
    const chunks = [];

    bb.on("file", (field, stream, info) => {
      if (!["file", "pdf"].includes(field)) { stream.resume(); return; }
      fileName = info.filename || "upload.pdf";
      mime = info.mimeType || info.mime || "";
      stream.on("data", (d) => { chunks.push(d); size += d.length; if (size > 10 * 1024 * 1024) stream.destroy(new Error("MAX_SIZE")); });
    });

    await new Promise((res, rej) => { bb.on("finish", res); bb.on("error", rej); bb.end(bodyBuf); });

    if (!fileName) return json(400, { success: false, error: "No file provided. Use field name 'file'." });
    if (!/^application\/pdf$/i.test(mime)) return json(400, { success: false, error: `Only PDF allowed. Got ${mime || "unknown"}` });

    const buffer = Buffer.concat(chunks);
    // TODO: store buffer to S3/Cloudinary/etc. and return URL
    return json(200, { success: true, filename: fileName, size: buffer.length });
  } catch (e) {
    const msg = e?.message || String(e);
    return json(msg === "MAX_SIZE" ? 400 : 500, { success: false, error: msg });
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