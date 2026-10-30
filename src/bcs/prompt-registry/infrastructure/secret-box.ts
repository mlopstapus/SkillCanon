import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { getJwtSecret } from "@/shared/config";

// shortcut: key is derived from JWT_SECRET (rotating it invalidates stored provider keys), upgrade to a dedicated KMS-backed key.
function key(secret: string = getJwtSecret()) {
  return createHash("sha256").update(`skillcanon:eval-provider-keys:${secret}`).digest();
}

/** AES-256-GCM; output is `iv.tag.ciphertext` in base64url. */
export function sealSecret(plain: string, secret?: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString("base64url")).join(".");
}

export function openSecret(sealed: string, secret?: string): string {
  const [iv, tag, enc] = sealed.split(".").map((p) => Buffer.from(p, "base64url")) as [Buffer, Buffer, Buffer];
  const decipher = createDecipheriv("aes-256-gcm", key(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}
