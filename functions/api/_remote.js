// Helper dung chung cho Web Remote (muc Remote trong trang tai khoan):
// app dang ky (Tunnel + ma ghep 6 so) -> web dang nhap tra ma -> lay Tunnel
// cua CHINH tai khoan minh -> trinh duyet goi thang API cua app qua Tunnel.
// Xem docs/web-remote.md muc 0 va docs/remote-registry-app-spec.md.
//
// Nguyen tac bao mat:
// - Chi luu SHA-256 cua ma; hash kem customer_id nen ma trung nhau giua 2
//   tai khoan khong bao gio tra cheo.
// - Ma song 10 phut. Dang ky moi (cung tai khoan) de len dang ky cu —
//   khop luat 1 tai khoan = 1 may dang cho dieu khien (1 slot).
// - Lookup chi tim trong dang ky cua tai khoan dang dang nhap web.

import { sha256Hex } from "./_lib.js";

export const REMOTE_CODE_TTL_MS = 10 * 60 * 1000; // 10 phut

// Chuan hoa ma ghep: bo moi ky tu khong phai so, bat buoc dung 6 so.
export function normalizeRemoteCode(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  return digits.length === 6 ? digits : "";
}

export async function hashRemoteCode(customerId, code) {
  return sha256Hex(`${customerId}:${code}`);
}

// URL Tunnel hop le: https bat ky host (quick tunnel *.trycloudflare.com,
// named tunnel domain rieng...), hoac http://127.0.0.1|localhost de test local.
// Khong chap nhan URL co credentials, qua dai, hoac scheme khac.
export function validTunnelUrl(raw) {
  const s = String(raw || "").trim();
  if (!s || s.length > 300) return "";
  let u;
  try { u = new URL(s); } catch { return ""; }
  if (u.username || u.password) return "";
  if (u.protocol === "https:") return s.replace(/\/+$/, "");
  if (u.protocol === "http:" && (u.hostname === "127.0.0.1" || u.hostname === "localhost")) {
    return s.replace(/\/+$/, "");
  }
  return "";
}

// Xac thuc phia APP cho remote-register / remote-unregister. Hai duong:
// 1) appToken cua app desktop (body.appToken hoac header Authorization:
//    Bearer) — doi chieu bang app_tokens (chua revoke), giong session-check.
// 2) Worker goi server-to-server bang X-Identity-Secret kem userId trong body
//    (giong bootstrap / identity/verify).
// Tra ve { customerId, app, deviceId } hoac null.
export async function appCaller(env, request, body) {
  const bearer = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const appToken = String((body && (body.appToken || body.app_token)) || bearer || "").trim();
  if (appToken) {
    try {
      const tokenHash = await sha256Hex(appToken);
      const row = await env.DB.prepare(
        "SELECT customer_id, app, device_id FROM app_tokens WHERE token_hash = ?1 AND revoked_at IS NULL"
      ).bind(tokenHash).first();
      if (row) return { customerId: row.customer_id, app: row.app, deviceId: row.device_id || null };
    } catch { /* DB loi -> thu duong secret, khong thi null */ }
  }

  const expected = env.IDENTITY_INTERNAL_SECRET;
  const got = (request.headers.get("X-Identity-Secret") || "").trim();
  const userId = String((body && (body.userId || body.user_id)) || "").trim();
  if (expected && got && userId && got.length === expected.length) {
    let diff = 0;
    for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
    if (diff === 0) {
      return {
        customerId: userId,
        app: String((body && body.app) || "video-builder").trim(),
        deviceId: String((body && (body.deviceId || body.device_id)) || "").trim().slice(0, 128) || null,
      };
    }
  }
  return null;
}

// Remote la quyen loi goi Plus (chot ban gia 2026-11-05: Go khong co Remote).
// Tai khoan duoc tinh la Plus khi co license tier 'plus', status 'active' va
// con han: expiry_utc NULL = chua kich hoat (han dem tu luc gan may) nen van
// con hieu luc; license dung thu Plus con han cung duoc tinh. Loi DB -> false
// (chan chua chac con hon mo oan tinh nang tra phi).
export async function hasActivePlus(env, customerId) {
  try {
    const row = await env.DB.prepare(
      "SELECT id FROM licenses WHERE customer_id = ?1 AND tier = 'plus' AND status = 'active' AND (expiry_utc IS NULL OR expiry_utc > ?2) LIMIT 1"
    ).bind(customerId, new Date().toISOString()).first();
    return !!row;
  } catch {
    return false;
  }
}

// Trang thai dang ky cua 1 tai khoan: 'live' | 'expired' | 'none' — de lookup
// bao dung ly do (chua co may dang ky / ma het han) thay vi 1 thong bao chung.
export async function getRegistrationState(env, customerId) {
  const row = await env.DB.prepare(
    "SELECT * FROM remote_registrations WHERE customer_id = ?1"
  ).bind(customerId).first();
  if (!row) return { state: "none", reg: null };
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await env.DB.prepare("DELETE FROM remote_registrations WHERE customer_id = ?1").bind(customerId).run();
    return { state: "expired", reg: null };
  }
  return { state: "live", reg: row };
}

// Doc dang ky dang song cua 1 tai khoan; het han thi xoa luon va tra null.
export async function getLiveRegistration(env, customerId) {
  const row = await env.DB.prepare(
    "SELECT * FROM remote_registrations WHERE customer_id = ?1"
  ).bind(customerId).first();
  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await env.DB.prepare("DELETE FROM remote_registrations WHERE customer_id = ?1").bind(customerId).run();
    return null;
  }
  return row;
}
