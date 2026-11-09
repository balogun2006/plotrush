import {
  createHmac,
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function newSecret() {
  const bytes = randomBytes(20);
  let bits = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  return bits
    .match(/.{5}/g)!
    .map((x) => alphabet[parseInt(x, 2)])
    .join("");
}
function decode(secret: string) {
  let bits = "";
  for (const c of secret) {
    const n = alphabet.indexOf(c);
    if (n < 0) throw Error("Invalid authenticator key");
    bits += n.toString(2).padStart(5, "0");
  }
  return Buffer.from((bits.match(/.{8}/g) ?? []).map((x) => parseInt(x, 2)));
}
export function totp(secret: string, counter: number) {
  const value = Buffer.alloc(8);
  value.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decode(secret)).update(value).digest();
  const offset = digest[19] & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000)
    .toString()
    .padStart(6, "0");
}
export function matchingCounter(
  secret: string,
  code: string,
  now: number,
  last: number,
) {
  if (!/^\d{6}$/.test(code)) return null;
  const current = Math.floor(now / 30000);
  for (const c of [current, current - 1, current + 1])
    if (
      c > last &&
      c >= 0 &&
      timingSafeEqual(Buffer.from(totp(secret, c)), Buffer.from(code))
    )
      return c;
  return null;
}
function key(master: string) {
  if (master.length < 32) throw Error("Staff encryption is not configured");
  return createHmac("sha256", master).update("plotrush-staff-mfa-v1").digest();
}
export function seal(secret: string, master: string, actor: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(master), iv);
  cipher.setAAD(Buffer.from(actor));
  const ciphertext = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), ciphertext]
    .map((b) => b.toString("base64url"))
    .join(".");
}
export function unseal(value: string, master: string, actor: string) {
  const [iv, tag, body] = value
    .split(".")
    .map((x) => Buffer.from(x, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key(master), iv);
  decipher.setAAD(Buffer.from(actor));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString(
    "utf8",
  );
}
