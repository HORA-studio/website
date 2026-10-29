// POST /api/identity/link-claim { code, deviceId } — app desktop doi ma dinh danh.
// Cong khai (app chua co token) nen co rate limit don gian theo IP.
// Tra ve { userId, token, app } — app luu token va gui kem moi lan bootstrap.
import { json, errorJson, readJson, sha256Hex } from "../_lib.js";
import { logEvent, clientIp } from "../_log.js";

const MAX_ATTEMPTS_PER_IP = 30;
const WINDOW_MS = 10 * 60 * 1000;

function randomToken() {
  return [...crypto.getRandomValues(new Uint8Array(32))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Dem so lan claim tu 1 IP trong cua so (dung bang app_links lam noi nho:
// dem cac phien da claim gan day). Don gian, khong can bang rieng.
async function rateLimited(env, ip) {
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM app_links WHERE claimed_at IS NOT NULL AND claimed_at > ?1 AND device_id = ?2"
  ).bind(since, ip).first();
  return row && Number(row.n) > MAX_ATTEMPTS_PER_IP;
}

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body) return errorJson("BAD_JSON", "Dữ liệu gửi lên không hợp lệ.", 400);

  const code = String(body.code || "").trim().toUpperCase();
  const deviceId = String(body.deviceId || body.device_id || "").trim().slice(0, 128);
  if (!code) return errorJson("INVALID_CODE", "Mã kết nối không hợp lệ.", 422);

  const ip = request.headers.get("CF-Connecting-IP") || "0.0.0.0";
  if (await rateLimited(env, ip)) {
    return errorJson("RATE_LIMITED", "Quá nhiều yêu cầu, thử lại sau.", 429);
  }

  const link = await env.DB.prepare("SELECT * FROM app_links WHERE code = ?1").bind(code).first();
  if (!link) return errorJson("LINK_NOT_FOUND", "Mã kết nối không tồn tại.", 404);
  if (link.status !== "pending") return errorJson("LINK_USED", "Mã kết nối đã được dùng hoặc đã hết hạn.", 409);
  if (new Date(link.expires_at).getTime() <= Date.now()) {
    await env.DB.prepare("UPDATE app_links SET status = 'expired' WHERE code = ?1").bind(code).run();
    return errorJson("LINK_EXPIRED", "Mã kết nối đã hết hạn.", 410);
  }

  const now = new Date().toISOString();
  const token = randomToken();
  const tokenHash = await sha256Hex(token);

  // Danh dau da dung (chi 1 lan) + cap token.
  const upd = await env.DB.prepare(
    "UPDATE app_links SET status = 'claimed', claimed_at = ?2, device_id = ?3 WHERE code = ?1 AND status = 'pending'"
  ).bind(code, now, ip).run();
  if ((upd.meta && upd.meta.changes) === 0) {
    return errorJson("LINK_USED", "Mã kết nối đã được dùng hoặc đã hết hạn.", 409);
  }

  await env.DB.prepare(
    "INSERT INTO app_tokens (token_hash, customer_id, app, device_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5)"
  ).bind(tokenHash, link.customer_id, link.app, deviceId || null, now).run();

  await logEvent(env, { eventType: "identity.link_claim", customerId: link.customer_id, actor: "app", ip, deviceId, details: { app: link.app } });
  return json({ userId: link.customer_id, token, app: link.app });
}

export function onRequest() {
  return errorJson("METHOD_NOT_ALLOWED", "Chỉ hỗ trợ POST.", 405);
}
