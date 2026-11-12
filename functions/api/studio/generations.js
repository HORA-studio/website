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
import { findModel, resolveModel, generationCost, generationOut, addLedger, getBalance, newStudioId, RETENTION_DAYS, toolBase, toolModelId, toolCreateJob, toolGetJob, toolFileUrl, toolPullResultToR2 } from "./_studio.js";

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
      const isRunning = r.status === "queued" || r.status === "working";
      // Muc da done nhung file van o may worker (chua co ban R2): keo bo sung
      // moi khi khach mo danh sach, cho toi khi co result_key thi thoi.
      const needsPull = r.status === "done" && !!env.STUDIO_MEDIA && !r.result_key;
      if (!isRunning && !needsPull) continue;
      let params = null;
      try { params = r.params_json ? JSON.parse(r.params_json) : null; } catch (e) { params = null; }
      const tid = params && params.toolJobId;
      if (!tid) continue;
      const t = await toolGetJob(env, tid);
      if (!t.ok || !t.job) continue;
      if (needsPull) {
        if (t.job.status === "done") {
          const pulled = await toolPullResultToR2(env, r.id, t.job).catch(() => null);
          if (pulled) {
            const url = "/api/studio/media?id=" + r.id;
            await env.DB.prepare(
              "UPDATE studio_generations SET result_key = ?2, result_url = ?3 WHERE id = ?1 AND status = 'done'"
            ).bind(r.id, pulled.key, url).run();
            r.result_key = pulled.key; r.result_url = url;
          }
        }
        continue;
      }
      if (t.job.status === "done") {
        // Uu tien keo file ve R2 ngay khi xong: link ben vung tren hora.works.
        // Keo loi/chua gan R2 -> tam dung link tunnel nhu cu, lan mo sau keo lai.
        let r2key = null;
        if (env.STUDIO_MEDIA) {
          const pulled = await toolPullResultToR2(env, r.id, t.job).catch(() => null);
          if (pulled) r2key = pulled.key;
        }
        const url = r2key ? "/api/studio/media?id=" + r.id : toolFileUrl(env, t.job);
        if (!url) continue;
        const up = await env.DB.prepare(
          "UPDATE studio_generations SET status = 'done', result_url = ?2, result_key = ?3, completed_at = ?4 WHERE id = ?1 AND status IN ('queued','working')"
        ).bind(r.id, url, r2key, new Date().toISOString()).run();
        if (up.meta && up.meta.changes === 1) { r.status = "done"; r.result_url = url; r.result_key = r2key; }
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
  const model = resolveModel(env, kind, modelId);
  if (!model) return errorJson("INVALID_MODEL", "Model không hợp lệ cho loại tạo này.", 422);

  const duration = kind === "video"
    ? (toolBase(env) ? Math.min(60, Math.max(1, Math.round(Number(body.duration) || 5))) : (Number(body.duration) === 10 ? 10 : 5))
    : null;
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
  const resolution = String(body.resolution || "").slice(0, 16);
  const refs = Array.isArray(body.refs)
    ? body.refs.filter((r) => typeof r === "string" && r.startsWith("data:image/") && r.length < 12_000_000).slice(0, 10)
    : [];
  const params = { ratio, ...(duration ? { duration } : {}), ...(resolution ? { resolution } : {}), ...(body.sourceKey ? { sourceKey: String(body.sourceKey) } : {}), ...(refs.length ? { refCount: refs.length } : {}) };
  await env.DB.prepare(
    `INSERT INTO studio_generations
       (id, customer_id, kind, prompt, model, model_name, params_json, status, credit_cost, created_at, expires_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'queued', ?8, ?9, ?10)`
  ).bind(id, a.customer.id, kind, prompt, model.id, model.name, JSON.stringify(params), cost, now.toISOString(), expires.toISOString()).run();

  // Day job sang Dreamina Tool neu da cau hinh STUDIO_TOOL_URL.
  if (toolBase(env)) {
    const sent = await toolCreateJob(env, {
      kind,
      // Ma don phia web: tool thay clientRef da co job chua loi thi tra lai
      // job do (chong tao trung khi mang chap chon lam mot don chay 2 lan).
      clientRef: id,
      prompt,
      model: toolModelId(env, kind, model),
      ratio,
      ...(duration ? { duration } : {}),
      ...(resolution ? { resolution } : {}),
      ...(refs.length ? { refs } : {}),
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
  // Co file tren R2 thi xoa luon (best-effort) — tranh file rac ton kho.
  const row = await env.DB.prepare(
    "SELECT result_key FROM studio_generations WHERE id = ?1 AND customer_id = ?2"
  ).bind(id, a.customer.id).first();
  if (row && row.result_key && env.STUDIO_MEDIA) {
    await env.STUDIO_MEDIA.delete(row.result_key).catch(() => undefined);
  }
  const res = await env.DB.prepare(
    "DELETE FROM studio_generations WHERE id = ?1 AND customer_id = ?2"
  ).bind(id, a.customer.id).run();
  if (!res.meta || res.meta.changes === 0) return errorJson("NOT_FOUND", "Không tìm thấy mục này trong thư viện của bạn.", 404);
  return json({ ok: true });
}

export function onRequest() {
  return errorJson("METHOD_NOT_ALLOWED", "Chỉ hỗ trợ GET, POST, DELETE.", 405);
}
