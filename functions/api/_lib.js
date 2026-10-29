// Thu vien dung chung cho cac Pages Function /api/* cua website HORA.
// Chay tren Cloudflare Workers runtime (WebCrypto, fetch, D1 qua env.DB).

export const PLANS = {
  go:   { name: "Go",   month: null, year: null },
  plus: { name: "Plus", month: null, year: null },
};

// Gia chinh thuc nam trong PLANS o tren (dong bo tay voi PLANS trong index.html
// va account.html). Cac bien PRICE_* chi la override de test local/staging,
// mac dinh khong dat -> gia null nhu PLANS.
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

// Co gang cap license cho don da thanh toan qua endpoint noi bo cua he license.
// Chi chay khi LICENSE_ISSUE_URL + LICENSE_ISSUE_SECRET duoc cau hinh; neu chua
// cau hinh hoac endpoint loi, don giu trang thai 'paid_pending_issue' (da thu
// tien nhung chua cap key) de doi xu ly — TUYET DOI khong tu bia key.
// order: hang orders + email cua khach (order.email; neu thieu se truy van DB).
export async function tryIssueLicense(env, order) {
  const markPending = async () => {
    await env.DB.prepare("UPDATE orders SET status = 'paid_pending_issue' WHERE id = ?1").bind(order.id).run();
    return false;
  };
  if (!env.LICENSE_ISSUE_URL || !env.LICENSE_ISSUE_SECRET) return markPending();

  let email = order.email;
  if (!email) {
    const c = await env.DB.prepare("SELECT email FROM customers WHERE id = ?1").bind(order.customer_id).first();
    email = c ? c.email : null;
  }

  let data;
  try {
    const res = await fetch(env.LICENSE_ISSUE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Issue-Secret": env.LICENSE_ISSUE_SECRET },
      body: JSON.stringify({ orderId: order.id, email, plan: order.plan, period: order.period }),
    });
    if (!res.ok) return markPending();
    data = await res.json();
  } catch {
    return markPending();
  }
  if (!data || !data.licenseKey) return markPending();

  const keyHash = await sha256Hex(String(data.licenseKey).trim());
  await env.DB.prepare(
    `INSERT OR IGNORE INTO customer_licenses
       (id, customer_id, license_key_hash, license_key_plain, product, tier, expires_at, source, order_id, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'purchase', ?8, ?9)`
  ).bind(
    crypto.randomUUID(),
    order.customer_id,
    keyHash,
    String(data.licenseKey).trim(),
    "HORA Media",
    data.tier || order.plan,
    data.expiresAt || null,
    order.id,
    new Date().toISOString()
  ).run();
  await env.DB.prepare("UPDATE orders SET status = 'paid', license_id = ?2 WHERE id = ?1")
    .bind(order.id, data.licenseId || null).run();
  return true;
}
