// GET/POST/DELETE /api/internal/demos — endpoint NOI BO quan ly danh sach
// video mau (bang demo_videos trong D1), xac thuc bang header
// X-Identity-Secret nhu /api/internal/promo. KHONG danh cho khach.
//
// GET    -> { demos: [...] } toan bo danh sach (ke ca video dang tat).
// POST   -> ghi DE toan bo danh sach. Chap nhan:
//             { demos: [ {...}, ... ] }  hoac  [ {...}, ... ]
//           Moi video: { id?, title (bat buoc), type, desc, videoUrl, image,
//             sortOrder, enabled }
//           videoUrl: link MP4/WebM truc tiep hoac link YouTube/Vimeo,
//             de trong = chua co video. image: URL anh poster/thumbnail.
// DELETE ?id=<id> -> xoa 1 video khoi danh sach.
import { json, errorJson, readJson } from "../_lib.js";
import { getDemoVideos, normalizeDemos, replaceDemoVideos, isHttpUrl } from "../_demos.js";

function secretOk(request, env) {
  const expected = env.IDENTITY_INTERNAL_SECRET;
  if (!expected) return false;
  const got = (request.headers.get("X-Identity-Secret") || "").trim();
  if (!got || got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

const unauthorized = () => errorJson("UNAUTHORIZED", "Thiếu hoặc sai X-Identity-Secret.", 401);

export async function onRequestGet({ request, env }) {
  if (!secretOk(request, env)) return unauthorized();
  return json({ demos: await getDemoVideos(env, { includeDisabled: true }) });
}

export async function onRequestPost({ request, env }) {
  if (!secretOk(request, env)) return unauthorized();
  const body = await readJson(request);
  if (!body || typeof body !== "object") return errorJson("BAD_JSON", "Dữ liệu gửi lên không hợp lệ.", 400);

  const rawList = Array.isArray(body) ? body : body.demos;
  if (!Array.isArray(rawList)) return errorJson("INVALID_CONFIG", "Thiếu mảng 'demos'.", 422);
  const list = normalizeDemos(rawList);

  const ids = new Set();
  for (let i = 0; i < list.length; i++) {
    const d = list[i];
    const src = rawList[i] && typeof rawList[i] === "object" ? rawList[i] : {};
    if (!String(src.title || "").trim())
      return errorJson("INVALID_CONFIG", `Video thứ ${i + 1} thiếu 'title'.`, 422);
    if (ids.has(d.id))
      return errorJson("INVALID_CONFIG", `Trùng id '${d.id}' trong danh sách.`, 422);
    ids.add(d.id);
    if (d.videoUrl && !isHttpUrl(d.videoUrl))
      return errorJson("INVALID_CONFIG", `videoUrl không hợp lệ ở video '${d.id}' (phải là link http/https hoặc để trống).`, 422);
    if (d.image && !isHttpUrl(d.image))
      return errorJson("INVALID_CONFIG", `image không hợp lệ ở video '${d.id}' (phải là link http/https hoặc để trống).`, 422);
  }

  try {
    await replaceDemoVideos(env, list);
  } catch {
    return errorJson("DB_ERROR", "Chưa ghi được vào database — đã chạy migration db/migrate-demo-videos-2026-10-30.sql trên D1 chưa?", 500);
  }
  return json({ ok: true, demos: list });
}

export async function onRequestDelete({ request, env }) {
  if (!secretOk(request, env)) return unauthorized();
  const id = (new URL(request.url).searchParams.get("id") || "").trim();
  if (!id) return errorJson("INVALID_CONFIG", "Thiếu tham số ?id=<id video>.", 422);
  try {
    await env.DB.prepare("DELETE FROM demo_videos WHERE id = ?1").bind(id).run();
  } catch {
    return errorJson("DB_ERROR", "Chưa xóa được trong database — đã chạy migration db/migrate-demo-videos-2026-10-30.sql trên D1 chưa?", 500);
  }
  return json({ ok: true, demos: await getDemoVideos(env, { includeDisabled: true }) });
}

export function onRequest() {
  return errorJson("METHOD_NOT_ALLOWED", "Chỉ hỗ trợ GET/POST/DELETE.", 405);
}
