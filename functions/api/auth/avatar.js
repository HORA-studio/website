// POST /api/auth/avatar { image } — dat/xoa anh dai dien cua tai khoan
// dang dang nhap. image la data URL (client da nen ve 160x160 JPEG/PNG,
// toi da ~140KB) hoac null de xoa (ve avatar chu cai / anh Google cu).
// Anh Google (https://...) chi bi ghi de boi anh tai len khi khach bam
// Upload; dang nhap Google khong tu ghi de anh da tai len.
import { json, errorJson, readJson, getSessionCustomer } from "../_lib.js";
import { logEvent, clientIp } from "../_log.js";

const MAX_DATA_URL = 190000; // ~140KB anh tho

export async function onRequestPost({ request, env }) {
  const customer = await getSessionCustomer(env, request);
  if (!customer) return errorJson("UNAUTHORIZED", "Bạn chưa đăng nhập.", 401);
  const body = await readJson(request);
  if (!body) return errorJson("BAD_JSON", "Dữ liệu gửi lên không hợp lệ.", 400);

  const image = body.image == null ? null : String(body.image);
  if (image !== null) {
    if (!/^data:image\/(jpeg|png|webp);base64,/.test(image) || image.length > MAX_DATA_URL) {
      return errorJson("BAD_IMAGE", "Ảnh không hợp lệ hoặc quá lớn (tối đa ~140KB sau khi nén).", 422);
    }
  }
  try {
    await env.DB.prepare("UPDATE customers SET avatar_url = ?2 WHERE id = ?1")
      .bind(customer.id, image).run();
  } catch {
    return errorJson("AVATAR_UNAVAILABLE", "Hệ thống chưa sẵn sàng cho ảnh đại diện. Hãy thử lại sau.", 400);
  }
  await logEvent(env, {
    eventType: image ? "auth.avatar_set" : "auth.avatar_cleared",
    customerId: customer.id, ip: clientIp(request),
  });
  return json({ ok: true, avatarUrl: image });
}

export function onRequest() {
  return errorJson("METHOD_NOT_ALLOWED", "Chỉ hỗ trợ POST.", 405);
}
