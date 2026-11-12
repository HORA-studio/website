// /api/studio/media?id=<generationId>
// Phuc vu file ket qua cua CHINH khach. Uu tien ban R2 (binding STUDIO_MEDIA) —
// file da duoc keo ve tu Dreamina Tool luc job xong (xem generations.js), link
// ben vung tren hora.works. CHUA co R2 thi web PROXY file tu tool bang token
// phia server: trinh duyet cua khach khong cham thang vao tool (the <img>
// khong gui duoc header x-tool-token nen link tunnel tho chi tra 401).
// Ban R2 ho tro Range de trinh xem video tua/phat duoc (206 Partial Content).
import { errorJson, requireAuth } from "../_lib.js";
import { toolBase, toolGetJob, toolFileUrl, toolHeaders, mediaContentType } from "./_studio.js";

async function proxyFromTool(env, row, url) {
  let tid = null;
  try { tid = row.params_json ? (JSON.parse(row.params_json) || {}).toolJobId : null; } catch (e) { tid = null; }
  if (!tid || !toolBase(env)) return errorJson("NOT_FOUND", "Không tìm thấy file kết quả.", 404);
  const t = await toolGetJob(env, tid);
  if (!t.ok || !t.job || t.job.status !== "done") {
    return errorJson("NOT_READY", "Kết quả chưa sẵn sàng hoặc máy worker đang tắt.", 502);
  }
  const fileUrl = toolFileUrl(env, t.job);
  if (!fileUrl) return errorJson("NOT_FOUND", "Không tìm thấy file kết quả.", 404);
  const up = await fetch(fileUrl, { headers: toolHeaders(env) });
  if (!up.ok || !up.body) return errorJson("UPSTREAM", "Không tải được file từ máy worker.", 502);
  const f = (t.job.results || []).find((x) => x && x.file);
  const headers = new Headers();
  headers.set("content-type", up.headers.get("content-type") || (f ? mediaContentType(f.file) : "application/octet-stream"));
  const len = up.headers.get("content-length");
  if (len) headers.set("content-length", len);
  headers.set("cache-control", "private, max-age=3600");
  if (url.searchParams.get("dl")) {
    headers.set("content-disposition", `attachment; filename="${f ? f.file : "ket-qua"}"`);
  }
  return new Response(up.body, { status: 200, headers });
}

export async function onRequestGet({ request, env }) {
  const a = await requireAuth(env, request);
  if (a.response) return a.response;

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return errorJson("MISSING_ID", "Thiếu tham số id.", 400);
  const row = await env.DB.prepare(
    "SELECT result_key, params_json FROM studio_generations WHERE id = ?1 AND customer_id = ?2"
  ).bind(id, a.customer.id).first();
  if (!row) {
    return errorJson("NOT_FOUND", "Không tìm thấy file kết quả.", 404);
  }
  if (!row.result_key || !env.STUDIO_MEDIA) {
    return proxyFromTool(env, row, url);
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
