// POST /api/remote/lookup { code } — (dang nhap web) tra ma ghep 6 so ->
// URL Tunnel cua CHINH tai khoan dang dang nhap.
//
// Bao mat:
// - Chi tim dang ky cua tai khoan minh (code_hash da tron customer_id) —
//   do trung ma cua tai khoan khac cung khong bao gio tra cheo.
// - Rate limit: toi da 10 lan tra SAI / tai khoan / 10 phut (dem tren bang
//   events remote.lookup_failed o DB_EVENTS; DB_EVENTS loi -> fail-open,
//   khong chan oan nguoi dung that).
// - Khong tra gi ngoai tunnel_url + ten may + han ma. Ma dung xong KHONG bi
//   tieu thu o day — buoc duyet tren may tinh (pair) moi la lop cuoi.
import { json, errorJson, readJson, requireAuth } from "../_lib.js";
import { logEvent, clientIp } from "../_log.js";
import { normalizeRemoteCode, hashRemoteCode, getRegistrationState, hasActivePlus } from "../_remote.js";

const MAX_FAILED = 10;
const WINDOW_MS = 10 * 60 * 1000;

async function tooManyFailed(env, customerId) {
  try {
    if (!env.DB_EVENTS) return false;
    const since = new Date(Date.now() - WINDOW_MS).toISOString();
    const row = await env.DB_EVENTS.prepare(
      "SELECT COUNT(*) AS n FROM events WHERE event_type = 'remote.lookup_failed' AND customer_id = ?1 AND created_at > ?2"
    ).bind(customerId, since).first();
    return row && Number(row.n) >= MAX_FAILED;
  } catch {
    return false; // khong dem duoc -> khong chan (fail-open)
  }
}

export async function onRequestPost({ request, env }) {
  const a = await requireAuth(env, request);
  if (a.response) return a.response;

  const body = await readJson(request);
  if (!body) return errorJson("BAD_JSON", "Dữ liệu gửi lên không hợp lệ.", 400);

  const code = normalizeRemoteCode(body.code);
  if (!code) return errorJson("INVALID_CODE", "Mã kết nối phải gồm đúng 6 chữ số.", 422);

  // Remote chi cho goi Plus — chan ngay o server: client web co sua code
  // trinh duyet de bo qua UI thi goi thang API nay van bi 403.
  if (!(await hasActivePlus(env, a.customer.id))) {
    return errorJson("PLUS_REQUIRED", "Remote là quyền lợi của gói Plus — tài khoản của bạn chưa có gói Plus đang còn hạn nên không kết nối được.", 403);
  }

  if (await tooManyFailed(env, a.customer.id)) {
    return errorJson("RATE_LIMITED", "Bạn đã thử sai mã quá nhiều lần — chờ 10 phút rồi thử lại.", 429);
  }

  let state = "none", reg = null;
  try {
    ({ state, reg } = await getRegistrationState(env, a.customer.id));
  } catch (err) {
    console.warn("remote/lookup failed:", err && err.message ? err.message : String(err));
    return errorJson("LOOKUP_FAILED", "Không tra được mã lúc này (có thể D1 chưa chạy migration remote).", 500);
  }

  // Bao dung tung ly do that bai — truoc day gom 1 thong bao chung lam user
  // khong biet loi o app chua dang ky, ma het han hay nhap sai ma.
  if (state !== "live") {
    await logEvent(env, {
      eventType: "remote.lookup_failed", customerId: a.customer.id, actor: "web",
      ip: clientIp(request), details: { reason: state },
    });
    if (state === "expired") {
      return errorJson("REMOTE_CODE_EXPIRED", "Mã đã hết hạn — mã kết nối chỉ sống 10 phút. Mở app HORA Media, lấy mã mới nhất trên app rồi nhập lại.", 404);
    }
    return errorJson("REMOTE_NO_REGISTRATION", "Tài khoản này chưa có máy nào đang mở Remote. Mở app HORA Media trên máy tính và bật Remote để app đăng ký mã mới (nếu app đang mở sẵn, tắt/bật lại Remote), rồi nhập mã app đang hiển thị.", 404);
  }

  const codeHash = await hashRemoteCode(a.customer.id, code);
  if (reg.code_hash !== codeHash) {
    await logEvent(env, {
      eventType: "remote.lookup_failed", customerId: a.customer.id, actor: "web",
      ip: clientIp(request), details: { reason: "code_mismatch" },
    });
    return errorJson("REMOTE_CODE_MISMATCH", "Mã không khớp với mã app đang hiển thị — mã thay đổi mỗi lần app đăng ký lại. Nhập đúng mã mới nhất trên app và chắc chắn app đang đăng nhập đúng tài khoản này.", 404);
  }

  await logEvent(env, {
    eventType: "remote.lookup_ok", customerId: a.customer.id, actor: "web",
    ip: clientIp(request), details: { app: reg.app, deviceName: reg.device_name },
  });

  return json({
    tunnelUrl: reg.tunnel_url,
    deviceName: reg.device_name,
    app: reg.app,
    expiresAt: reg.expires_at,
  });
}

export function onRequest() {
  return errorJson("METHOD_NOT_ALLOWED", "Chỉ hỗ trợ POST.", 405);
}
