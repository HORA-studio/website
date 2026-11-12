// Phong chung cua doi (team.hora.works / hora.works/team.html).
// Bang rieng team_* trong D1 hora-website — KHONG dung du lieu Studio/khach.
// Thanh vien vao bang MA RIENG tung nguoi; D1 chi luu BAN BAM SHA-256 cua ma.
import { sha256Hex } from "../_lib.js";

// Ban bam cua 6 ma khoi tao (Owner + 5 thanh vien). Ban ro chi ton tai trong
// bao cao giao cho chu phong 1 lan luc dung phong — khong nam trong repo nay.
export const SEED_HASHES = {
  "Owner": "feccdd63ba77e3594ce493a243f9d5877e27cfd10bb672def45d0e20c28dd4ac",
  "Boss": "701da27ebd09d3cd845ade4ce71732f90b93aa65c20e2f4d73a95d4de8627390",
  "Rocky": "978f62c245e2d9f2f2f5e06bf6e5026476bd752c85a251aefbc53c5e33fe1748",
  "Juno": "34c11dd9ed0049073b3fc454bef3f9363608628b76cfec5febe408b12b3c4a50",
  "Maren": "9c3932c4706ba9bdf93aaf1d561b75f5fa5050534571ac1e0018db26e8f9b7be",
  "Juny": "59bdb44f6338021f4af5948997c17634c53bba32db6e155ff711f754ec3cb285"
};

export const SEED_MEMBERS = [
  { name: "Owner", role: "owner" },
  { name: "Boss", role: "member" },
  { name: "Rocky", role: "member" },
  { name: "Juno", role: "member" },
  { name: "Maren", role: "member" },
  { name: "Juny", role: "member" },
];

let schemaReady = false;

// Migration nhe: them cot neu thieu (kiem qua PRAGMA) — khong vo du lieu live.
async function ensureColumn(env, table, column, ddl) {
  const { results } = await env.DB.prepare(`PRAGMA table_info(${table})`).all();
  const has = (results || []).some((r) => r.name === column);
  if (!has) {
    await env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`).run();
  }
}

export async function ensureSchema(env) {
  if (schemaReady) return;
  const stmts = [
    `CREATE TABLE IF NOT EXISTS team_members (
       name TEXT PRIMARY KEY,
       role TEXT NOT NULL DEFAULT 'member',
       code_hash TEXT NOT NULL,
       revoked INTEGER NOT NULL DEFAULT 0,
       created_at TEXT NOT NULL DEFAULT (datetime('now')),
       last_seen_at TEXT
     )`,
    `CREATE TABLE IF NOT EXISTS team_sessions (
       token_hash TEXT PRIMARY KEY,
       name TEXT NOT NULL,
       created_at TEXT NOT NULL DEFAULT (datetime('now')),
       expires_at TEXT NOT NULL
     )`,
    `CREATE TABLE IF NOT EXISTS team_messages (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       name TEXT NOT NULL,
       body TEXT NOT NULL,
       created_at TEXT NOT NULL DEFAULT (datetime('now'))
     )`,
    `CREATE TABLE IF NOT EXISTS team_access_log (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       name TEXT,
       ok INTEGER NOT NULL,
       created_at TEXT NOT NULL DEFAULT (datetime('now'))
     )`,
  ];
  for (const s of stmts) await env.DB.prepare(s).run();
  // Cot bo sung cua ban nang cap (khoa API + luong hoi dap) — them khi thieu.
  await ensureColumn(env, "team_members", "api_hash", "TEXT");
  await ensureColumn(env, "team_messages", "mentions", "TEXT");
  await ensureColumn(env, "team_messages", "kind", "TEXT");
  await ensureColumn(env, "team_messages", "status", "TEXT");
  await ensureColumn(env, "team_messages", "reply_to", "INTEGER");
  // Seed thanh vien lan dau (bang rong moi seed).
  const { results } = await env.DB.prepare("SELECT COUNT(*) AS n FROM team_members").all();
  if ((results?.[0]?.n ?? 0) === 0) {
    for (const m of SEED_MEMBERS) {
      await env.DB.prepare(
        "INSERT INTO team_members (name, role, code_hash) VALUES (?1, ?2, ?3)"
      ).bind(m.name, m.role, SEED_HASHES[m.name]).run();
    }
  }
  schemaReady = true;
}

export function randomCode() {
  const alpha = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let raw = "";
  for (const b of bytes) raw += alpha[b % alpha.length];
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
}

function cookieValue(request, name) {
  const raw = request.headers.get("Cookie") || "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

// Hien dien: cap nhat last_seen toi da 1 lan/phut.
async function touchPresence(env, name) {
  await env.DB.prepare(
    "UPDATE team_members SET last_seen_at = datetime('now') WHERE name = ?1 AND (last_seen_at IS NULL OR last_seen_at < datetime('now', '-60 seconds'))"
  ).bind(name).run();
}

// Xac thuc bang cookie phien dang nhap web.
export async function getCookieMember(env, request) {
  await ensureSchema(env);
  const token = cookieValue(request, "team_session");
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const { results } = await env.DB.prepare(
    `SELECT m.name, m.role, m.revoked FROM team_sessions s
     JOIN team_members m ON m.name = s.name
     WHERE s.token_hash = ?1 AND s.expires_at > datetime('now')`
  ).bind(tokenHash).all();
  const row = results?.[0];
  if (!row || row.revoked) return null;
  await touchPresence(env, row.name);
  return { name: row.name, role: row.role };
}

// Xac thuc bang khoa API may: header "Authorization: Bearer tk_...".
export async function getApiMember(env, request) {
  await ensureSchema(env);
  const auth = request.headers.get("Authorization") || "";
  const m = auth.match(/^Bearer\s+(tk_.+)$/);
  if (!m) return null;
  const hash = await sha256Hex(m[1].trim());
  const { results } = await env.DB.prepare(
    "SELECT name, role, revoked FROM team_members WHERE api_hash = ?1"
  ).bind(hash).all();
  const row = results?.[0];
  if (!row || row.revoked) return null;
  await touchPresence(env, row.name);
  return { name: row.name, role: row.role };
}

// Xac thuc chung: thu cookie truoc, roi khoa API. Tra them via: 'cookie'|'api'.
export async function getSessionMember(env, request) {
  const byCookie = await getCookieMember(env, request);
  if (byCookie) return { ...byCookie, via: "cookie" };
  const byApi = await getApiMember(env, request);
  if (byApi) return { ...byApi, via: "api" };
  return null;
}

// Khoa API dai han cho may/worker tu dong canh phong. D1 chi luu ban bam.
export function newApiToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return "tk_" + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function issueApiToken(env, name) {
  const token = newApiToken();
  const hash = await sha256Hex(token);
  await env.DB.prepare("UPDATE team_members SET api_hash = ?2 WHERE name = ?1")
    .bind(name, hash).run();
  return token;
}

export async function createSession(env, name) {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const token = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  const tokenHash = await sha256Hex(token);
  await env.DB.prepare(
    "INSERT INTO team_sessions (token_hash, name, expires_at) VALUES (?1, ?2, datetime('now', '+30 days'))"
  ).bind(tokenHash, name).run();
  return token;
}

export function sessionCookie(token) {
  return `team_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 24 * 3600}`;
}

export async function logAccess(env, name, ok) {
  await env.DB.prepare("INSERT INTO team_access_log (name, ok) VALUES (?1, ?2)")
    .bind(name || null, ok ? 1 : 0).run();
}
