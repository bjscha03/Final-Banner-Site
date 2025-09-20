// netlify/functions/upload-file.js
import Busboy from "busboy";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from 'uuid';

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
    if (!/^(application\/pdf|image\/(jpeg|png))$/i.test(mime)) return json(400, { success: false, error: `Only PDF, JPG, or PNG allowed. Got ${mime || "unknown"}` });

    const buffer = Buffer.concat(chunks);

    // S3 Upload Logic
    const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME;
    const S3_REGION = process.env.S3_REGION || "us-east-1"; // Default to us-east-1 if not set

    console.log("S3_BUCKET_NAME:", S3_BUCKET_NAME);
    console.log("S3_REGION:", S3_REGION);

    if (!S3_BUCKET_NAME) {
      console.error("S3_BUCKET_NAME environment variable not set.");
      return json(500, { success: false, error: "S3_BUCKET_NAME environment variable not set." });
    }

    const s3Client = new S3Client({ region: S3_REGION });
    const fileKey = `uploads/${uuidv4()}-${fileName}`;

    const uploadParams = {
      Bucket: S3_BUCKET_NAME,
      Key: fileKey,
      Body: buffer,
      ContentType: mime,
      ACL: 'public-read', // Make the file publicly accessible
    };

    try {
      await s3Client.send(new PutObjectCommand(uploadParams));
      const fileUrl = `https://${S3_BUCKET_NAME}.s3.${S3_REGION}.amazonaws.com/${fileKey}`;
      return json(200, { success: true, filename: fileName, size: buffer.length, fileUrl: fileUrl });
    } catch (s3Error) {
      console.error("Error uploading to S3:", s3Error);
      return json(500, { success: false, error: `Failed to upload file to S3: ${s3Error.message}` });
    }

  } catch (e) {
    const msg = e?.message || String(e);
    console.error("General error in upload-file function:", e);
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