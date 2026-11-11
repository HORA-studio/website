// /api/studio/generations
// GET    — danh sach ket qua gen cua CHINH khach (moi nhat truoc). Muc het han
//          (expires_at < now) tu chuyen status 'expired' va an result_url.
// POST   — tao yeu cau gen: validate -> tinh gia theo model -> TRU credit
//          (ledger 'spend') -> ghi generation status 'queued', expires_at +30d.
//          Provider gen that (fal.ai / Dreamina) xu ly tiep o tang Queue/Worker
//          (chua noi trong nhanh nay — xem docs/studio.md): worker cap nhat
//          status done/failed; failed thi goi addLedger 'refund' hoan 100%.
// DELETE — ?id=... : khach xoa muc cua chinh minh (file R2 do cron don theo
//          result_key, hoac xoa ngay khi co worker).
import { json, errorJson, readJson, requireAuth } from "../_lib.js";
import { findModel, generationCost, generationOut, addLedger, getBalance, newStudioId, RETENTION_DAYS, toolBase, toolModelId, toolCreateJob, toolGetJob, toolFileUrl } from "./_studio.js";

export async function onRequestGet({ request, env }) {
  const a = await requireAuth(env, request);
  if (a.response) return a.response;

  const nowIso = new Date().toISOString();
  // Danh dau het han (idempotent, chi cham vao muc cua chinh khach vua doc).
  await env.DB.prepare(
    "UPDATE studio_generations SET status = 'expired', result_url = NULL WHERE customer_id = ?1 AND status = 'done' AND expires_at < ?2"
  ).bind(a.customer.id, nowIso).run();

  const { results } = await env.DB.prepare(
    "SELECT * FROM studio_generations WHERE customer_id = ?1 ORDER BY created_at DESC LIMIT 200"
  ).bind(a.customer.id).all();
  const rows = results || [];

  // Dong bo trang thai tu Dreamina Tool cho cac muc dang chay (neu da noi).
  if (toolBase(env)) {
    for (const r of rows) {
      if (r.status !== "queued" && r.status !== "working") continue;
      let params = null;
      try { params = r.params_json ? JSON.parse(r.params_json) : null; } catch (e) { params = null; }
      const tid = params && params.toolJobId;
      if (!tid) continue;
      const t = await toolGetJob(env, tid);
      if (!t.ok || !t.job) continue;
      if (t.job.status === "done") {
        const url = toolFileUrl(env, t.job);
        if (!url) continue;
        const up = await env.DB.prepare(
          "UPDATE studio_generations SET status = 'done', result_url = ?2, completed_at = ?3 WHERE id = ?1 AND status IN ('queued','working')"
        ).bind(r.id, url, new Date().toISOString()).run();
        if (up.meta && up.meta.changes === 1) { r.status = "done"; r.result_url = url; }
      } else if (t.job.status === "failed" || t.job.status === "interrupted") {
        const errMsg = String(t.job.error || t.job.stage || "Dreamina tool bao loi");
        const up = await env.DB.prepare(
          "UPDATE studio_generations SET status = 'failed', error = ?2 WHERE id = ?1 AND status IN ('queued','working')"
        ).bind(r.id, errMsg).run();
        if (up.meta && up.meta.changes === 1) {
          await addLedger(env, a.customer.id, r.credit_cost, "refund", r.id, "Hoan credit — gen loi (Dreamina tool)");
          r.status = "failed"; r.error = errMsg;
        }
      } else if (t.job.status === "working" && r.status === "queued") {
        await env.DB.prepare(
          "UPDATE studio_generations SET status = 'working' WHERE id = ?1 AND status = 'queued'"
        ).bind(r.id).run();
        r.status = "working";
      }
      // tool 'awaiting_approval': giu nguyen phia web — duyet credit lam trong tool.
    }
  }
  return json({ generations: rows.map(generationOut) });
}

export async function onRequestPost({ request, env }) {
  const a = await requireAuth(env, request);
  if (a.response) return a.response;

  const body = await readJson(request);
  if (!body) return errorJson("BAD_JSON", "Dữ liệu gửi lên không hợp lệ.", 400);

  const kind = String(body.kind || "");
  const prompt = String(body.prompt || "").trim();
  const modelId = String(body.model || "");
  if (kind !== "image" && kind !== "video") return errorJson("INVALID_KIND", "Loại tạo phải là 'image' hoặc 'video'.", 422);
  if (!prompt || prompt.length > 2000) return errorJson("INVALID_PROMPT", "Mô tả không được trống và tối đa 2000 ký tự.", 422);
  const model = findModel(kind, modelId);
  if (!model) return errorJson("INVALID_MODEL", "Model không hợp lệ cho loại tạo này.", 422);

  const duration = kind === "video" ? (Number(body.duration) === 10 ? 10 : 5) : null;
  const ratio = ["1:1", "9:16", "16:9", "3:4"].includes(String(body.ratio)) ? String(body.ratio) : "9:16";
  const cost = generationCost(kind, model, { duration });

  const balance = await getBalance(env, a.customer.id);
  if (balance < cost) {
    return errorJson("INSUFFICIENT_CREDITS", `Không đủ credit: cần ${cost}, hiện có ${balance}.`, 402);
  }

  const now = new Date();
  const id = newStudioId("gen");
  const spend = await addLedger(env, a.customer.id, -cost, "spend", id, `Tạo ${kind === "video" ? "video" : "ảnh"} · ${model.name}`);
  if (!spend.ok) return errorJson("INSUFFICIENT_CREDITS", "Không đủ credit.", 402);

  const expires = new Date(now.getTime() + RETENTION_DAYS * 24 * 3600 * 1000);
  const params = { ratio, ...(duration ? { duration } : {}), ...(body.sourceKey ? { sourceKey: String(body.sourceKey) } : {}) };
  await env.DB.prepare(
    `INSERT INTO studio_generations
       (id, customer_id, kind, prompt, model, model_name, params_json, status, credit_cost, created_at, expires_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'queued', ?8, ?9, ?10)`
  ).bind(id, a.customer.id, kind, prompt, model.id, model.name, JSON.stringify(params), cost, now.toISOString(), expires.toISOString()).run();

  // Day job sang Dreamina Tool neu da cau hinh STUDIO_TOOL_URL.
  if (toolBase(env)) {
    const sent = await toolCreateJob(env, {
      kind,
      prompt,
      model: toolModelId(env, kind, model),
      ratio,
      ...(duration ? { duration } : {}),
      creditCeiling: Number(env.STUDIO_TOOL_CEILING || 0),
    });
    if (sent.ok && sent.job) {
      params.toolJobId = sent.job.id;
      await env.DB.prepare(
        "UPDATE studio_generations SET status = 'working', params_json = ?2 WHERE id = ?1"
      ).bind(id, JSON.stringify(params)).run();
    } else if (!sent.skipped && !sent.network) {
      // Tool tu choi (vd thieu dang nhap/model sai): hoan credit + bao loi.
      await addLedger(env, a.customer.id, cost, "refund", id, "Hoan credit — Dreamina tool tu choi job");
      await env.DB.prepare(
        "UPDATE studio_generations SET status = 'failed', error = ?2 WHERE id = ?1"
      ).bind(id, String(sent.error || "Provider loi")).run();
      return errorJson("PROVIDER_ERROR", "Dreamina tool từ chối job: " + String(sent.error || "không rõ lỗi"), 502);
    } else if (sent.network) {
      // Tool khong toi duoc (chua bat/sai URL): giu 'queued', danh dau de doi soat.
      params.toolError = "unreachable";
      await env.DB.prepare(
        "UPDATE studio_generations SET params_json = ?2 WHERE id = ?1"
      ).bind(id, JSON.stringify(params)).run();
    }
  }

  const row = await env.DB.prepare("SELECT * FROM studio_generations WHERE id = ?1").bind(id).first();
  return json({ generation: generationOut(row), balance: spend.balance }, 201);
}

export async function onRequestDelete({ request, env }) {
  const a = await requireAuth(env, request);
  if (a.response) return a.response;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return errorJson("MISSING_ID", "Thiếu tham số id.", 400);
  const res = await env.DB.prepare(
    "DELETE FROM studio_generations WHERE id = ?1 AND customer_id = ?2"
  ).bind(id, a.customer.id).run();
  if (!res.meta || res.meta.changes === 0) return errorJson("NOT_FOUND", "Không tìm thấy mục này trong thư viện của bạn.", 404);
  return json({ ok: true });
}

export function onRequest() {
  return errorJson("METHOD_NOT_ALLOWED", "Chỉ hỗ trợ GET, POST, DELETE.", 405);
}
