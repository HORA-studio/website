// POST /api/identity/link-create — (dang nhap) tao phien ket noi app.
// Web hien ma (code) cho khach; khach dua ma cho app desktop; app goi
// /api/identity/link-claim de doi lay userId + token. Ma dung 1 lan, TTL 10 phut.
import { json, errorJson, readJson, requireAuth } from "../_lib.js";
import { logEvent, clientIp } from "../_log.js";

const TTL_MS = 10 * 60 * 1000;
const ALLOWED_APPS = new Set(["video-builder", "facebook-builder"]);

function newLinkCode() {
  const raw = [...crypto.getRandomValues(new Uint8Array(4))]
    .map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `HORA-LINK-${raw}`;
}

export async function onRequestPost({ request, env }) {
  const a = await requireAuth(env, request);
  if (a.response) return a.response;

  const body = await readJson(request);
  const app = String((body && body.app) || "video-builder");
  if (!ALLOWED_APPS.has(app)) return errorJson("INVALID_APP", "Ứng dụng không hợp lệ.", 422);

  const now = new Date();
  const code = newLinkCode();
  const expiresAt = new Date(now.getTime() + TTL_MS);

  await env.DB.prepare(
    "INSERT INTO app_links (code, customer_id, app, status, created_at, expires_at) VALUES (?1, ?2, ?3, 'pending', ?4, ?5)"
  ).bind(code, a.customer.id, app, now.toISOString(), expiresAt.toISOString()).run();

  const origin = new URL(request.url).origin;
  await logEvent(env, { eventType: "identity.link_create", customerId: a.customer.id, ip: clientIp(request), details: { app } });
  return json({
    code,
    app,
    expiresAt: expiresAt.toISOString(),
    linkUrl: `${origin}/link?code=${encodeURIComponent(code)}`,
  }, 201);
}

export function onRequest() {
  return errorJson("METHOD_NOT_ALLOWED", "Chỉ hỗ trợ POST.", 405);
}
