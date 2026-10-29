// Thu vien dung chung cho cac Pages Function /api/* cua website HORA.
// Chay tren Cloudflare Workers runtime (WebCrypto, fetch, D1 qua env.DB).

// GIA TAM — user chot tam 2026-10-29, cho gia that (khong phai gia chinh thuc).
export const PLANS = {
  go:   { name: "Go",   month: 199000, year: 1990000 },
  plus: { name: "Plus", month: 299000, year: 2990000 },
};

// Gia chinh thuc nam trong PLANS o tren (dong bo tay voi PLANS trong index.html;
// account.html tu lay gia tu GET /api/plans nen tu dong theo server, chi con
// ban sao du phong khi fetch loi). Cac bien PRICE_* chi la override de test
// local/staging, mac dinh khong dat -> dung gia PLANS o tren.
export function getPlans(env = {}) {
  const out = {};
  for (const [key, p] of Object.entries(PLANS)) {
    const up = key.toUpperCase();
    const num = (v) => {
      const n = Number(v);
      return v !== undefined && v !== null && v !== "" && Number.isFinite(n) && n > 0 ? Math.round(n) : null;
    };
    out[key] = {
      name: p.name,
      month: num(env[`PRICE_${up}_MONTH`]) ?? p.month,
      year: num(env[`PRICE_${up}_YEAR`]) ?? p.year,
    };
  }
  return out;
}

// ---------- JSON helpers ----------
export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...extraHeaders },
  });
}

export function errorJson(code, message, status) {
  return json({ error: { code, message } }, status);
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

// ---------- Crypto helpers (WebCrypto) ----------
const enc = new TextEncoder();

export function bytesToBase64(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function base64ToBytes(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------- Password (PBKDF2-SHA256) ----------
export const PBKDF2_ITERATIONS = 100000;

export async function hashPassword(password, iterations = PBKDF2_ITERATIONS) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    256
  );
  return { hash: bytesToBase64(new Uint8Array(bits)), salt: bytesToBase64(salt), iterations };
}

export async function verifyPassword(password, expectedHashB64, saltB64, iterations) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: base64ToBytes(saltB64), iterations: iterations || PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    256
  );
  const actual = bytesToBase64(new Uint8Array(bits));
  // So sanh thoi gian hang so (do dai bang nhau vi cung 32 bytes base64)
  if (actual.length !== expectedHashB64.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expectedHashB64.charCodeAt(i);
  return diff === 0;
}

// ---------- Session ----------
export const SESSION_COOKIE = "hora_session";
export const SESSION_DAYS = 30;

export function sessionCookieHeader(token, maxAgeSeconds) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function parseCookies(request) {
  const header = request.headers.get("Cookie") || "";
  const out = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx > 0) out[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  }
  return out;
}

export async function createSession(env, customerId) {
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = [...tokenBytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  const tokenHash = await sha256Hex(token);
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 24 * 3600 * 1000);
  await env.DB.prepare(
    "INSERT INTO sessions (token_hash, customer_id, expires_at, created_at) VALUES (?1, ?2, ?3, ?4)"
  ).bind(tokenHash, customerId, expires.toISOString(), now.toISOString()).run();
  return { token, cookie: sessionCookieHeader(token, SESSION_DAYS * 24 * 3600) };
}

export async function destroySession(env, request) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (token) {
    const tokenHash = await sha256Hex(token);
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?1").bind(tokenHash).run();
  }
  return sessionCookieHeader("", 0);
}

// Tra ve hang customers (khong co password_hash/salt) hoac null.
export async function getSessionCustomer(env, request) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT c.id, c.email, c.display_name, c.created_at, s.expires_at
       FROM sessions s JOIN customers c ON c.id = s.customer_id
      WHERE s.token_hash = ?1`
  ).bind(tokenHash).first();
  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?1").bind(tokenHash).run();
    return null;
  }
  return { id: row.id, email: row.email, displayName: row.display_name, createdAt: row.created_at };
}

// Tra ve { customer } hoac { response } (401) — dung: const a = await requireAuth(...); if (a.response) return a.response;
export async function requireAuth(env, request) {
  const customer = await getSessionCustomer(env, request);
  if (!customer) return { response: errorJson("UNAUTHORIZED", "Bạn cần đăng nhập.", 401) };
  return { customer };
}

// ---------- Don hang / license ----------
export function newOrderId() {
  const rand = [...crypto.getRandomValues(new Uint8Array(4))]
    .map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase().slice(0, 6);
  return `HORA-${Date.now().toString(36).toUpperCase()}-${rand}`;
}

export const LICENSE_KEY_RE = /^[A-Z][A-Z0-9]*_[0-9A-F]{32}$/;

// Sinh license key: <PREFIX>_<32 hex>. PREFIX lay tu app (mac dinh HORA).
export function newLicenseKey(prefix = "HORA") {
  const hex = [...crypto.getRandomValues(new Uint8Array(16))]
    .map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `${prefix}_${hex}`;
}

export function newLicenseId() {
  return [...crypto.getRandomValues(new Uint8Array(16))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Plan -> app + tier. Don mua tren web hien chi co go/plus cua Video Builder.
const PLAN_APP = { go: "video-builder", plus: "video-builder" };
export function appForPlan(plan) {
  return PLAN_APP[plan] || "video-builder";
}

// Cap license cho don da thanh toan — NGAY TRONG DB web (khong con goi endpoint
// ngoai). expiry_utc = NULL de han bat dau dem tu luc bind device (giong logic
// he license cu). Doi lai, don thanh 'paid' + co license_id.
// IDEMPOTENT theo order_id: don da co license thi chi dong bo lai orders
// (status 'paid' + license_id cu), KHONG cap license thu hai — IPN/webhook
// cua cong goi lai bao nhieu lan cung an toan.
export async function tryIssueLicense(env, order) {
  const existing = await env.DB.prepare(
    "SELECT id FROM licenses WHERE order_id = ?1 LIMIT 1"
  ).bind(order.id).first();
  if (existing) {
    await env.DB.prepare("UPDATE orders SET status = 'paid', license_id = ?2 WHERE id = ?1")
      .bind(order.id, existing.id).run();
    return true;
  }

  const now = new Date().toISOString();
  const app = appForPlan(order.plan);
  const productId = app;
  const validityDays = order.period === "year" ? 365 : 30;
  const licenseId = newLicenseId();
  const licenseKey = newLicenseKey("HORA");

  await env.DB.prepare(
    `INSERT INTO licenses
       (id, license_key, customer_id, app, product_id, tier, status, organization,
        expiry_utc, validity_days, activated_at, revoked_at, source, order_id, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'active', 'user', NULL, ?7, NULL, NULL, 'purchase', ?8, ?9)`
  ).bind(licenseId, licenseKey, order.customer_id, app, productId, order.plan, validityDays, order.id, now).run();

  await env.DB.prepare("UPDATE orders SET status = 'paid', license_id = ?2 WHERE id = ?1")
    .bind(order.id, licenseId).run();
  return true;
}

// ---------- Auth token dung 1 lan (xac thuc email / dat lai mat khau) ----------
// Chi luu SHA-256 cua token trong bang auth_tokens; token tho chi nam trong
// link gui qua email. Xem functions/api/_mail.js va docs/customer-accounts.md.

// URL goc cua website de dung link trong email (env.SITE_URL tuy chon).
export function siteUrl(env = {}) {
  return String(env.SITE_URL || "https://hora.works").replace(/\/+$/, "");
}

// Phat hanh token moi: huy (danh dau used) moi token chua dung cung
// customer + purpose truoc, roi tao token tho ngau nhien 32 byte (hex).
export async function issueAuthToken(env, customerId, purpose, ttlMs) {
  const now = new Date();
  const nowIso = now.toISOString();
  await env.DB.prepare(
    "UPDATE auth_tokens SET used_at = ?1 WHERE customer_id = ?2 AND purpose = ?3 AND used_at IS NULL"
  ).bind(nowIso, customerId, purpose).run();

  const raw = [...crypto.getRandomValues(new Uint8Array(32))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  const tokenHash = await sha256Hex(raw);
  const expiresAt = new Date(now.getTime() + ttlMs).toISOString();
  await env.DB.prepare(
    `INSERT INTO auth_tokens (id, customer_id, purpose, token_hash, expires_at, used_at, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, NULL, ?6)`
  ).bind(crypto.randomUUID(), customerId, purpose, tokenHash, expiresAt, nowIso).run();
  return raw;
}

// Dung token: khong thay/da dung -> TOKEN_INVALID; het han -> TOKEN_EXPIRED;
// hop le -> danh dau used_at va tra customerId. Token chi dung duoc 1 lan.
export async function consumeAuthToken(env, rawToken, purpose) {
  if (!rawToken) return { ok: false, code: "TOKEN_INVALID" };
  const tokenHash = await sha256Hex(String(rawToken));
  const row = await env.DB.prepare(
    "SELECT id, customer_id, expires_at, used_at FROM auth_tokens WHERE token_hash = ?1 AND purpose = ?2"
  ).bind(tokenHash, purpose).first();
  if (!row || row.used_at) return { ok: false, code: "TOKEN_INVALID" };
  if (new Date(row.expires_at).getTime() <= Date.now()) return { ok: false, code: "TOKEN_EXPIRED" };
  await env.DB.prepare("UPDATE auth_tokens SET used_at = ?1 WHERE id = ?2")
    .bind(new Date().toISOString(), row.id).run();
  return { ok: true, customerId: row.customer_id };
}

// Doc email_verified_at cua khach (null = chua xac thuc). Fail-soft: DB chua
// ap migration (thieu cot) thi tra null thay vi nem loi lam vo /api/auth/me.
export async function getEmailVerifiedAt(env, customerId) {
  try {
    const row = await env.DB.prepare(
      "SELECT email_verified_at FROM customers WHERE id = ?1"
    ).bind(customerId).first();
    return row ? row.email_verified_at : null;
  } catch {
    return null;
  }
}
