import Busboy from "busboy";
import fs from "fs";
import path from "path";

// Increase cap if you like; try 50MB to be safe
const MAX_BYTES = 50 * 1024 * 1024; // was 25MB
// We'll grab more header to detect "%PDF-" even with BOM/whitespace
const HEADER_SNIFF = 2048; // bytes
const TMP_DIR = "/tmp";

const ALLOWED_EXT = new Set(["pdf","jpg","jpeg","png","webp","gif","svg","heic","heif"]);
const isPng = (h) => h.length>=8 && h[0]===0x89 && h[1]===0x50 && h[2]===0x4E && h[3]===0x47;
const isJpg = (h) => h.length>=2 && h[0]===0xFF && h[1]===0xD8;
const isGif = (h) => h.length>=4 && h.slice(0,4).toString() === "GIF8";
const isWebp= (h) => h.length>=12 && h.slice(0,4).toString()==="RIFF" && h.slice(8,12).toString()==="WEBP";
const isHeic= (h) => {
  // look for "ftyp" then brand like "heic","heif","hevc","mif1"
  const s = h.slice(0,32).toString();
  return s.includes("ftypheic") || s.includes("ftypheif") || s.includes("ftyphevc") || s.includes("ftypmif1");
};
// SVG is XML/text; no strong magic signature. We'll allow by mime/ext.

const okMime = (mime, ext) => {
  if (!mime) return true; // we’ll rely on magic/extension below
  if (mime.toLowerCase()==="application/pdf") return true;
  if (mime.toLowerCase().startsWith("image/")) return true;
  if (mime.toLowerCase()==="application/octet-stream" && ALLOWED_EXT.has(ext)) return true;
  // some HEICs report as application/heic
  if (mime.toLowerCase().includes("heic") || mime.toLowerCase().includes("heif")) return true;
  return false;
};

const magicLooksLike = (header, ext) => {
  // PDF is handled by looksLikePdf
  if (isPng(header)) return "png";
  if (isJpg(header)) return "jpg";
  if (isGif(header)) return "gif";
  if (isWebp(header)) return "webp";
  if (isHeic(header)) return "heic";
  // svg can't be reliably magic-checked; allow if extension says svg
  if (ext==="svg") return "svg";
  return "unknown";
};

function looksLikePdf(buf) {
  // strip UTF-8 BOM if present
  const BOM = Buffer.from([0xEF, 0xBB, 0xBF]);
  if (buf.slice(0, 3).equals(BOM)) buf = buf.slice(3);

  // trim leading whitespace/newlines that some generators add
  let i = 0;
  while (i < buf.length && (buf[i] === 0x20 || buf[i] === 0x0A || buf[i] === 0x0D || buf[i] === 0x09)) i++;
  buf = buf.slice(i);

  // accept if "%PDF-" occurs at start (or very near start)
  return buf.slice(0, 5).toString() === "%PDF-";
}

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
    let filePath = "";
    let headerBuf = Buffer.alloc(0);

    const done = new Promise((resolve, reject) => {
      bb.on("file", (field, stream, info) => {
        // accept common field names; if you use a custom one, add it here
        if (!["file","pdf","image","upload"].includes(field)) { stream.resume(); return; }

        fileName = info.filename || "upload.bin";
        mime = info.mimeType || info.mime || "";

        const safe = fileName.replace(/[^\w.\-]+/g, "_");
        filePath = path.join(TMP_DIR, `${Date.now()}_${safe}`);
        const out = fs.createWriteStream(filePath);

        stream.on("data", (chunk) => {
          size += chunk.length;
          if (size > MAX_BYTES) { stream.destroy(new Error("MAX_SIZE")); return; }

          // capture up to HEADER_SNIFF bytes for magic sniff
          if (headerBuf.length < HEADER_SNIFF) {
            const need = HEADER_SNIFF - headerBuf.length;
            headerBuf = Buffer.concat([headerBuf, chunk.slice(0, need)]);
          }
          out.write(chunk);
        });

        stream.on("end", () => out.end());
        stream.on("error", reject);
        out.on("error", reject);
        out.on("finish", () => resolve());
      });

      bb.on("error", reject);
      bb.on("finish", () => { if (!fileName) resolve(); });
    });

    bb.end(bodyBuf);
    await done;

    if (!fileName) return json(400, { success:false, error:"No file provided. Use field name 'file'." });

    const ext = path.extname(fileName).slice(1).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      try { if (filePath) fs.unlinkSync(filePath); } catch {} // eslint-disable-line no-empty
      return json(400, { success:false, error:`Unsupported extension ".${ext}". Allowed: ${[...ALLOWED_EXT].join(", ")}` });
    }

    if (!okMime(mime, ext)) {
      try { if (filePath) fs.unlinkSync(filePath); } catch {} // eslint-disable-line no-empty
      return json(400, { success:false, error:`Unsupported MIME "${mime}".` });
    }

    const magic = magicLooksLike(headerBuf, ext);
    if (ext === "pdf" && !looksLikePdf(headerBuf)) {
      try { if (filePath) fs.unlinkSync(filePath); } catch {} // eslint-disable-line no-empty
      return json(400, { success:false, error:"Not a valid PDF header (try re-exporting)."});
    }
    if (["jpg","jpeg"].includes(ext) && magic!=="jpg") {
      try { if (filePath) fs.unlinkSync(filePath); } catch {} // eslint-disable-line no-empty
      return json(400, { success:false, error:`Not a valid JPEG (magic=${magic}).` });
    }
    if (ext==="png" && magic!=="png") {
      try { if (filePath) fs.unlinkSync(filePath); } catch {} // eslint-disable-line no-empty
      return json(400, { success:false, error:`Not a valid PNG (magic=${magic}).` });
    }
    if (ext==="webp" && magic!=="webp") {
      try { if (filePath) fs.unlinkSync(filePath); } catch {} // eslint-disable-line no-empty
      return json(400, { success:false, error:`Not a valid WEBP (magic=${magic}).` });
    }
    if (["heic","heif"].includes(ext) && magic!=="heic") {
      // many HEICs still pass as jpg magic=false; we accept if mime/ext says heic/heif
      if (!(mime.toLowerCase().includes("heic") || mime.toLowerCase().includes("heif") || mime.toLowerCase()==="application/octet-stream")) {
        try { if (filePath) fs.unlinkSync(filePath); } catch {} // eslint-disable-line no-empty
        return json(400, { success:false, error:`Not a valid HEIC/HEIF (magic=${magic}, mime=${mime}).` });
      }
    }
    // svg: skip magic check; ext already validated

    // TODO: upload filePath to your storage (S3/Cloudinary/etc.) and return its URL.
    const result = { success:true, filename:fileName, size, mime, ext, magic };

    // Clean tmp unless you keep it
    try { fs.unlinkSync(filePath); } catch {} // eslint-disable-line no-empty

    return json(200, result);

  } catch (e) {
    const msg = e?.message || String(e);
    return json(msg==="MAX_SIZE" ? 400 : 500, { success:false, error: msg });
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