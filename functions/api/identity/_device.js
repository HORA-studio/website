// Helper dung chung cho device authorization flow (kieu GitHub).
// Xem functions/api/identity/device/*.js: app xin cap device_code + user_code,
// user mo /device bam "Dong y", app poll nhan token.
//
// QUY UOC: device_code chi luu SHA-256 (token tho chi nam trong response cho app);
// user_code la ma ngan hien tren web de doi chieu. Xem docs/customer-accounts.md.

import { sha256Hex } from "../_lib.js";

export const DEVICE_TTL_MS = 15 * 60 * 1000; // 15 phut
export const DEVICE_INTERVAL = 5;            // giay app nen cho giua 2 lan poll
export const ALLOWED_APPS = new Set(["video-builder", "facebook-builder"]);

// Bang chu khong nhap nhang (bo I, O, 0, 1) — user doc/danh may de nham.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// Ma 32 byte hex ngau nhien (device_code / token).
export function randomHex32() {
  return [...crypto.getRandomValues(new Uint8Array(32))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

// user_code dang XXXX-XXXX tu bang chu khong nhap nhang.
export function newUserCode() {
  const pick = () => CODE_ALPHABET[crypto.getRandomValues(new Uint8Array(1))[0] % CODE_ALPHABET.length];
  let out = "";
  for (let i = 0; i < 8; i++) {
    if (i === 4) out += "-";
    out += pick();
  }
  return out;
}

// Chuan hoa user_code nguoi dung nhap: bo ky tu la, viet hoa, chen lai gach giua.
// "abcd1234" / "abcd 1234" -> "ABCD-1234". Tra "" neu khong du 8 ky tu hop le.
export function normalizeUserCode(raw) {
  const cleaned = String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (cleaned.length !== 8) return "";
  return `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`;
}

// Het han thi danh dau 'expired' (chi khi con pending/approved chua phat token).
export async function expireIfStale(env, row) {
  if (!row || row.status === "expired" || row.status === "denied") return row;
  if (new Date(row.expires_at).getTime() > Date.now()) return row;
  await env.DB.prepare(
    "UPDATE device_auth SET status = 'expired' WHERE device_code_hash = ?1 AND status IN ('pending','approved')"
  ).bind(row.device_code_hash).run();
  return { ...row, status: "expired" };
}

// Chan tao phien qua nhieu tu 1 IP (dung bang device_auth lam noi nho).
export async function rateLimitedByIp(env, ip, max = 30, windowMs = 10 * 60 * 1000) {
  if (!ip) return false;
  const since = new Date(Date.now() - windowMs).toISOString();
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM device_auth WHERE created_at > ?1 AND ip = ?2"
  ).bind(since, ip).first();
  return row && Number(row.n) > max;
}

export { sha256Hex };
