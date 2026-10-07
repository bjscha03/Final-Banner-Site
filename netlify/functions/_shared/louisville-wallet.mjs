import crypto from "node:crypto";
import { promisify } from "node:util";
import { getStore } from "@netlify/blobs";
import forge from "node-forge";
import { PKPass } from "passkit-generator";
import sharp from "sharp";
import outreach from "./louisville-outreach.cjs";
const generateKeyPair = promisify(crypto.generateKeyPair);
const AAD = Buffer.from("bof-wallet-signing-v1");
const storage = () =>
  getStore({ name: "bof-wallet-signing-v1", consistency: "strong" });
const fail = (message, statusCode = 400) =>
  Object.assign(new Error(message), { statusCode });
function encryptionKey(env = process.env) {
  const secret =
    env.WALLET_ENCRYPTION_SECRET ||
    env.AUTH_SESSION_SECRET ||
    env.CLOUDINARY_API_SECRET;
  if (!secret) throw fail("Wallet key storage is not configured.", 503);
  return crypto.createHash("sha256").update(AAD).update(secret).digest();
}
export function seal(value, env = process.env) {
  const iv = crypto.randomBytes(12),
    cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(env), iv);
  cipher.setAAD(AAD);
  const body = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return {
    v: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    body: body.toString("base64"),
  };
}
export function unseal(value, env = process.env) {
  if (value?.v !== 1)
    throw fail("Wallet configuration could not be opened.", 503);
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey(env),
    Buffer.from(value.iv, "base64"),
  );
  decipher.setAAD(AAD);
  decipher.setAuthTag(Buffer.from(value.tag, "base64"));
  return JSON.parse(
    Buffer.concat([
      decipher.update(Buffer.from(value.body, "base64")),
      decipher.final(),
    ]).toString(),
  );
}
export async function createCertificateRequest() {
  const { privateKey, publicKey } = await generateKeyPair("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  const csr = forge.pki.createCertificationRequest();
  csr.publicKey = forge.pki.publicKeyFromPem(publicKey);
  csr.setSubject([
    { name: "commonName", value: "Banners On The Fly Wallet" },
    { name: "organizationName", value: "Banners On The Fly" },
    { name: "countryName", value: "US" },
  ]);
  csr.sign(forge.pki.privateKeyFromPem(privateKey), forge.md.sha256.create());
  return {
    signerKey: privateKey,
    csr: forge.pki.certificationRequestToPem(csr),
    createdAt: new Date().toISOString(),
  };
}
export async function certificateRequest() {
  const store = storage();
  let pending = await store.get("pending", { type: "json" });
  if (!pending) {
    await store.setJSON("pending", seal(await createCertificateRequest()), {
      onlyIfNew: true,
    });
    pending = await store.get("pending", { type: "json" });
  }
  return { csr: unseal(pending).csr }; // The private key never leaves the server.
}
export function validateCertificate(raw, signerKey, intermediate) {
  let cert, wwdr, key;
  try {
    cert = new crypto.X509Certificate(raw);
    wwdr = new crypto.X509Certificate(intermediate);
    key = crypto.createPrivateKey(signerKey);
  } catch {
    throw fail("Upload the Pass Type ID certificate downloaded from Apple.");
  }
  const passTypeIdentifier = cert.subject.match(
    /(?:^|\n)UID=(pass\.[^\n]+)/,
  )?.[1];
  const teamIdentifier = cert.subject.match(
    /(?:^|\n)OU=([A-Z0-9]{10})(?:\n|$)/,
  )?.[1];
  if (!passTypeIdentifier || !teamIdentifier || !cert.checkPrivateKey(key))
    throw fail(
      "This certificate does not match this site’s certificate request or is not a Pass Type ID certificate.",
    );
  if (
    !wwdr.ca ||
    !wwdr.subject.includes("Apple Worldwide Developer Relations") ||
    !cert.verify(wwdr.publicKey)
  )
    throw fail("Apple could not verify this Pass Type ID certificate.");
  if (
    Date.parse(cert.validFrom) > Date.now() ||
    Date.parse(cert.validTo) <= Date.now() + 86400000
  )
    throw fail(
      "The Apple certificate is not active or expires within 24 hours.",
    );
  return {
    signerCert: cert.toString(),
    signerKey,
    wwdr: wwdr.toString(),
    passTypeIdentifier,
    teamIdentifier,
    expiresAt: new Date(cert.validTo).toISOString(),
  };
}
export async function configureCertificate(base64) {
  if (typeof base64 !== "string" || base64.length > 40000)
    throw fail("Choose a certificate smaller than 30 KB.");
  const store = storage(),
    pending = await store.get("pending", { type: "json" });
  if (!pending)
    throw fail(
      "Download the certificate request first, then create your Pass Type ID certificate with it.",
    );
  // Fixed Apple HTTPS endpoint only. No user-controlled URLs or trust anchors.
  const response = await fetch(
    "https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer",
    { signal: AbortSignal.timeout(10000), redirect: "error" },
  );
  if (!response.ok)
    throw fail(
      "Apple’s certificate service is unavailable. Please retry.",
      503,
    );
  const config = validateCertificate(
    Buffer.from(base64, "base64"),
    unseal(pending).signerKey,
    Buffer.from(await response.arrayBuffer()),
  );
  // Build and sign a complete pass before publishing a new signer.
  await buildPass(
    { id: "setup-check", discount_code: "LOU25-00000000000000000000" },
    config,
  );
  await store.setJSON("active", seal(config));
  return publicStatus(config);
}
function publicStatus(config) {
  if (!config)
    return { ready: false, reason: "Apple Pass Type ID certificate needed" };
  return {
    ready: Date.parse(config.expiresAt) > Date.now() + 86400000,
    passTypeIdentifier: config.passTypeIdentifier,
    expiresAt: config.expiresAt,
    reason:
      Date.parse(config.expiresAt) > Date.now() + 86400000
        ? null
        : "Renew your Apple Pass Type ID certificate",
  };
}
export async function walletStatus() {
  const active = await storage().get("active", { type: "json" });
  return publicStatus(active ? unseal(active) : null);
}
let assets;
async function passAssets() {
  if (!assets)
    assets = (async () => {
      const files = {};
      const icon =
        '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" rx="20" fill="#122641"/><path fill="#ff790e" d="M12 23h72L65 47l19 25H12z"/><text x="23" y="56" font-family="Arial,sans-serif" font-weight="bold" font-size="28" fill="#fff">BOF</text></svg>';
      for (const scale of [1, 2, 3])
        files[`icon${scale === 1 ? "" : `@${scale}x`}.png`] = await sharp(
          Buffer.from(icon),
        )
          .resize(29 * scale, 29 * scale)
          .png()
          .toBuffer();
      const strip =
        '<svg xmlns="http://www.w3.org/2000/svg" width="750" height="288"><rect width="750" height="288" fill="#122641"/><circle cx="700" cy="-20" r="220" fill="#1b3657"/><path d="M580 288L750 100V288" fill="#f45b08"/><text x="36" y="47" font-family="Arial,sans-serif" font-size="20" letter-spacing="3" fill="#ffb37d">A LITTLE LOCAL LOVE</text><text x="30" y="168" font-family="Arial,sans-serif" font-size="112" font-weight="bold" fill="#fff">25% OFF</text><text x="36" y="228" font-family="Arial,sans-serif" font-size="25" fill="#fff">YOUR NEXT BANNER</text></svg>';
      files["strip.png"] = await sharp(Buffer.from(strip))
        .resize(375, 144)
        .png()
        .toBuffer();
      files["strip@2x.png"] = await sharp(Buffer.from(strip)).png().toBuffer();
      files["strip@3x.png"] = await sharp(Buffer.from(strip))
        .resize(1125, 432)
        .png()
        .toBuffer();
      return files;
    })().catch((e) => {
      assets = null;
      throw e;
    });
  return assets;
}
export async function buildPass(lead, config) {
  const url = `${outreach.SITE}/louisville-offer?code=${encodeURIComponent(lead.discount_code)}`;
  const pass = new PKPass(
    await passAssets(),
    {
      wwdr: config.wwdr,
      signerCert: config.signerCert,
      signerKey: config.signerKey,
    },
    {
      formatVersion: 1,
      passTypeIdentifier: config.passTypeIdentifier,
      teamIdentifier: config.teamIdentifier,
      serialNumber: lead.id,
      organizationName: "Banners On The Fly",
      description: "25% off your next banner",
      logoText: "Banners On The Fly",
      backgroundColor: "rgb(18,38,65)",
      foregroundColor: "rgb(255,255,255)",
      labelColor: "rgb(255,179,125)",
      sharingProhibited: true,
    },
  );
  pass.type = "coupon";
  pass.headerFields.push({
    key: "location",
    label: "LOCAL LOVE",
    value: "Louisville",
  });
  pass.secondaryFields.push({
    key: "shipping",
    label: "PLUS FREE SHIPPING",
    value: "Next-Day Air",
  });
  pass.auxiliaryFields.push({
    key: "validity",
    label: "SAVE IT FOR LATER",
    value: "No expiration · One use",
  });
  pass.backFields.push(
    { key: "code", label: "YOUR 25% OFF CODE", value: lead.discount_code },
    { key: "redeem", label: "USE YOUR COUPON", value: url },
    { key: "terms", label: "OFFER DETAILS", value: outreach.TERMS },
    {
      key: "support",
      label: "QUESTIONS?",
      value: "support@bannersonthefly.com",
    },
  );
  pass.setBarcodes({
    format: "PKBarcodeFormatQR",
    message: url,
    messageEncoding: "iso-8859-1",
    altText: lead.discount_code,
  });
  return pass.getAsBuffer();
}
export async function signedPass(lead) {
  const active = await storage().get("active", { type: "json" });
  const config = active ? unseal(active) : null;
  if (!publicStatus(config).ready)
    throw fail(
      "Apple Wallet is not ready yet. Your coupon can still be used on our website.",
      503,
    );
  return buildPass(lead, config);
}
