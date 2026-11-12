// /api/studio/media?id=<generationId>
// Phuc vu file ket qua cua CHINH khach tu R2 (binding STUDIO_MEDIA) — file da
// duoc keo ve tu Dreamina Tool luc job xong (xem generations.js). Link ben
// vung tren hora.works: may worker tat/tunnel doi dia chi khong anh huong.
// Ho tro Range de trinh xem video tua/phat duoc (206 Partial Content).
import { errorJson, requireAuth } from "../_lib.js";

export async function onRequestGet({ request, env }) {
  const a = await requireAuth(env, request);
  if (a.response) return a.response;

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return errorJson("MISSING_ID", "Thiếu tham số id.", 400);
  if (!env.STUDIO_MEDIA) {
    return errorJson("NO_STORAGE", "Kho lưu trữ kết quả chưa được cấu hình.", 503);
  }
  const row = await env.DB.prepare(
    "SELECT result_key FROM studio_generations WHERE id = ?1 AND customer_id = ?2"
  ).bind(id, a.customer.id).first();
  if (!row || !row.result_key) {
    return errorJson("NOT_FOUND", "Không tìm thấy file kết quả.", 404);
  }

  // Range (video seeking): bytes=a-b / bytes=a- / bytes=-n
  let rangeOpt;
  const rangeHdr = request.headers.get("range");
  if (rangeHdr) {
    const m = /bytes=(\d*)-(\d*)/.exec(rangeHdr);
    if (m && (m[1] || m[2])) {
      if (m[1]) {
        rangeOpt = { offset: Number(m[1]) };
        if (m[2]) rangeOpt.length = Number(m[2]) - Number(m[1]) + 1;
      } else {
        rangeOpt = { suffix: Number(m[2]) };
      }
    }
  }
  const obj = rangeOpt
    ? await env.STUDIO_MEDIA.get(row.result_key, { range: rangeOpt })
    : await env.STUDIO_MEDIA.get(row.result_key);
  if (!obj) return errorJson("NOT_FOUND", "Không tìm thấy file kết quả.", 404);

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  if (!headers.get("content-type")) headers.set("content-type", "application/octet-stream");
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", "private, max-age=3600");
  if (url.searchParams.get("dl")) {
    const name = row.result_key.split("/").pop() || "ket-qua";
    headers.set("content-disposition", `attachment; filename="${name}"`);
  }

  let status = 200;
  if (rangeOpt && obj.range) {
    const start = obj.range.offset || 0;
    const len = obj.range.length != null ? obj.range.length : obj.size - start;
    headers.set("content-range", `bytes ${start}-${start + len - 1}/${obj.size}`);
    headers.set("content-length", String(len));
    status = 206;
  } else {
    headers.set("content-length", String(obj.size));
  }
  return new Response(obj.body, { status, headers });
}

export function onRequest() {
  return errorJson("METHOD_NOT_ALLOWED", "Chỉ hỗ trợ GET.", 405);
}
