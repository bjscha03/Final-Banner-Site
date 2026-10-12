import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import forge from "node-forge";
import sharp from "sharp";
import {
  createCertificateRequest,
  seal,
  unseal,
  validateCertificate,
  buildPass,
} from "../_shared/louisville-wallet.mjs";

test("CSR is valid and encrypted key storage detects tampering and the wrong encryption key", async () => {
  const config = await createCertificateRequest();
  assert.ok(forge.pki.certificationRequestFromPem(config.csr).verify());
  assert.ok(!config.csr.includes("PRIVATE KEY"));
  const env = { AUTH_SESSION_SECRET: "wallet-test-secret" },
    encrypted = seal(config, env);
  assert.ok(!JSON.stringify(encrypted).includes("PRIVATE KEY"));
  assert.deepEqual(unseal(encrypted, env), config);
  assert.throws(() =>
    unseal(encrypted, { AUTH_SESSION_SECRET: "wrong-secret" }),
  );
  const damaged = {
    ...encrypted,
    body: Buffer.from("tampered").toString("base64"),
  };
  assert.throws(() => unseal(damaged, env));
});
function fixture() {
  // This self-signed fixture tests package integrity only. Production accepts
  // the intermediate fetched directly from Apple, never this test CA.
  const caKeys = forge.pki.rsa.generateKeyPair(2048),
    ca = forge.pki.createCertificate();
  ca.publicKey = caKeys.publicKey;
  ca.serialNumber = "01";
  ca.validity.notBefore = new Date(Date.now() - 86400000);
  ca.validity.notAfter = new Date(Date.now() + 365 * 86400000);
  ca.setSubject([
    {
      name: "commonName",
      value: "Apple Worldwide Developer Relations Test Fixture",
    },
  ]);
  ca.setIssuer(ca.subject.attributes);
  ca.setExtensions([{ name: "basicConstraints", cA: true }]);
  ca.sign(caKeys.privateKey, forge.md.sha256.create());
  const keys = forge.pki.rsa.generateKeyPair(2048),
    cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "02";
  cert.validity.notBefore = ca.validity.notBefore;
  cert.validity.notAfter = ca.validity.notAfter;
  cert.setSubject([
    {
      type: "0.9.2342.19200300.100.1.1",
      value: "pass.com.bannersonthefly.test",
    },
    { name: "organizationalUnitName", value: "ABCDEFGHIJ" },
    { name: "commonName", value: "Pass Type ID: test" },
  ]);
  cert.setIssuer(ca.subject.attributes);
  cert.sign(caKeys.privateKey, forge.md.sha256.create());
  return {
    cert: forge.pki.certificateToPem(cert),
    key: forge.pki.privateKeyToPem(keys.privateKey),
    ca: forge.pki.certificateToPem(ca),
  };
}
function unzipStored(buffer) {
  const files = {};
  let offset = 0;
  while (buffer.readUInt32LE(offset) === 0x04034b50) {
    assert.equal(buffer.readUInt16LE(offset + 8), 0);
    const size = buffer.readUInt32LE(offset + 18),
      nameLength = buffer.readUInt16LE(offset + 26),
      extra = buffer.readUInt16LE(offset + 28);
    const name = buffer
      .subarray(offset + 30, offset + 30 + nameLength)
      .toString();
    const start = offset + 30 + nameLength + extra;
    files[name] = buffer.subarray(start, start + size);
    offset = start + size;
  }
  return files;
}
test("coupon package has correct dimensions, a redemption QR, stable identity and a verifiable signature", async () => {
  const f = fixture(),
    config = validateCertificate(f.cert, f.key, f.ca);
  assert.equal(config.passTypeIdentifier, "pass.com.bannersonthefly.test");
  const wrongKey = crypto
    .generateKeyPairSync("rsa", { modulusLength: 2048 })
    .privateKey.export({ type: "pkcs8", format: "pem" });
  assert.throws(
    () => validateCertificate(f.cert, wrongKey, f.ca),
    /does not match/,
  );
  const lead = {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    discount_code: "LOU25-AAAAAAAAAAAAAAAAAAAA",
    email: "private@example.invalid",
  };
  const buffer = await buildPass(lead, config),
    files = unzipStored(buffer),
    pass = JSON.parse(files["pass.json"]);
  assert.equal(pass.serialNumber, lead.id);
  assert.equal(pass.description, "25% off your next banner");
  assert.ok(pass.coupon);
  assert.equal(pass.barcodes[0].format, "PKBarcodeFormatQR");
  assert.match(pass.barcodes[0].message, /louisville-offer\?code=LOU25-/);
  assert.ok(!files["pass.json"].includes("private@example.invalid"));
  assert.equal((await sharp(files["strip@2x.png"]).metadata()).width, 750);
  assert.equal((await sharp(files["icon@3x.png"]).metadata()).width, 87);
  const manifest = JSON.parse(files["manifest.json"]);
  for (const [name, hash] of Object.entries(manifest))
    assert.equal(
      crypto.createHash("sha1").update(files[name]).digest("hex"),
      hash,
    );
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bof-wallet-test-"));
  try {
    fs.writeFileSync(path.join(dir, "signature"), files.signature);
    fs.writeFileSync(path.join(dir, "manifest"), files["manifest.json"]);
    execFileSync(
      "openssl",
      [
        "smime",
        "-verify",
        "-inform",
        "DER",
        "-in",
        path.join(dir, "signature"),
        "-content",
        path.join(dir, "manifest"),
        "-noverify",
      ],
      { stdio: "pipe" },
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
