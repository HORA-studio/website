// POST /api/app/remote-register — app desktop dang ky Web Remote:
// { appToken | (X-Identity-Secret + userId), tunnelUrl, code, deviceName?, deviceId?, app? }
//
// App goi endpoint nay ngay khi co URL Tunnel + ma ghep 6 so (va goi lai khi
// URL/ma doi, hoac de gia han — moi lan dang ky reset han 10 phut).
// Web chi luu SHA-256 cua ma; 1 tai khoan chi giu 1 dang ky dang song
// (dang ky moi de len dang ky cu — khop luat 1 slot cua Web Remote).
//
// Tra ve { ok, expiresAt, connectUrl } — connectUrl la link app hien kem ma
// va dung lam QR: user quet QR la mo dung muc Remote da dien san ma.
import { json, errorJson, readJson, siteUrl } from "../_lib.js";
import { logEvent, clientIp } from "../_log.js";
import { appCaller, normalizeRemoteCode, hashRemoteCode, validTunnelUrl, hasActivePlus, REMOTE_CODE_TTL_MS } from "../_remote.js";

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body) return errorJson("BAD_JSON", "Dữ liệu gửi lên không hợp lệ.", 400);

  const caller = await appCaller(env, request, body);
  if (!caller) return errorJson("UNAUTHORIZED", "Token ứng dụng không hợp lệ hoặc đã bị thu hồi.", 401);

  // Remote chi cho goi Plus — app cua tai khoan khong co Plus con han thi
  // khong dang ky duoc, nen web khong bao gio tra ra Tunnel cho tai khoan do.
  if (!(await hasActivePlus(env, caller.customerId))) {
    return errorJson("PLUS_REQUIRED", "Remote là quyền lợi của gói Plus — tài khoản chưa có gói Plus đang còn hạn nên app không đăng ký kết nối được.", 403);
  }

  const tunnelUrl = validTunnelUrl(body.tunnelUrl || body.tunnel_url);
  if (!tunnelUrl) return errorJson("INVALID_TUNNEL_URL", "URL Tunnel không hợp lệ (phải là https, hoặc http://127.0.0.1 khi test local).", 422);

  const code = normalizeRemoteCode(body.code);
  if (!code) return errorJson("INVALID_CODE", "Mã ghép phải gồm đúng 6 chữ số.", 422);

  const app = String(body.app || caller.app || "video-builder").trim().slice(0, 64);
  const deviceId = String(body.deviceId || body.device_id || caller.deviceId || "").trim().slice(0, 128) || null;
  const deviceName = String(body.deviceName || body.device_name || "").trim().slice(0, 80) || null;

  const now = new Date();
  const expiresAt = new Date(now.getTime() + REMOTE_CODE_TTL_MS);
  const codeHash = await hashRemoteCode(caller.customerId, code);

  try {
    await env.DB.prepare(
      `INSERT INTO remote_registrations
         (customer_id, app, device_id, device_name, tunnel_url, code_hash, created_at, expires_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
       ON CONFLICT(customer_id) DO UPDATE SET
         app = excluded.app, device_id = excluded.device_id,
         device_name = excluded.device_name, tunnel_url = excluded.tunnel_url,
         code_hash = excluded.code_hash, created_at = excluded.created_at,
         expires_at = excluded.expires_at`
    ).bind(caller.customerId, app, deviceId, deviceName, tunnelUrl, codeHash, now.toISOString(), expiresAt.toISOString()).run();
  } catch (err) {
    console.warn("app/remote-register failed:", err && err.message ? err.message : String(err));
    return errorJson("REGISTER_FAILED", "Không đăng ký được Remote (có thể D1 chưa chạy migration remote).", 500);
  }

  await logEvent(env, {
    eventType: "remote.register", customerId: caller.customerId, actor: "app",
    ip: clientIp(request), deviceId, details: { app, deviceName },
  });

  return json({
    ok: true,
    expiresAt: expiresAt.toISOString(),
    ttlSeconds: Math.round(REMOTE_CODE_TTL_MS / 1000),
    connectUrl: `${siteUrl(env)}/account.html?remote_code=${code}`,
  });
}

export function onRequest() {
  return errorJson("METHOD_NOT_ALLOWED", "Chỉ hỗ trợ POST.", 405);
}
