// GET/POST /api/internal/promo — endpoint NOI BO xem/ghi cau hinh khuyen mai
// (bang meta, key 'promotion'), xac thuc bang header X-Identity-Secret nhu
// /api/internal/retry-issue. KHONG danh cho khach.
//
// GET  -> { config } cau hinh dang hieu luc (da merge voi mac dinh).
// POST body = JSON cau hinh (day du hoac mot phan; cac truong con thieu giu
// nguyen gia tri dang dung). Validate co ban: enabled phai la boolean neu
// co, startsAt/endsAt phai parse duoc va startsAt < endsAt, trialDays 1..90,
// purchaseBonusPercent 0..200, trialTier 'go'|'plus'. Ghi xong tra lai
// { ok:true, config }.
import { json, errorJson, readJson } from "../_lib.js";
import { getPromotion, PROMO_META_KEY } from "../_promo.js";

function secretOk(request, env) {
  const expected = env.IDENTITY_INTERNAL_SECRET;
  if (!expected) return false;
  const got = (request.headers.get("X-Identity-Secret") || "").trim();
  if (!got || got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export async function onRequestGet({ request, env }) {
  if (!secretOk(request, env)) return errorJson("UNAUTHORIZED", "Thiếu hoặc sai X-Identity-Secret.", 401);
  return json({ config: await getPromotion(env) });
}

export async function onRequestPost({ request, env }) {
  if (!secretOk(request, env)) return errorJson("UNAUTHORIZED", "Thiếu hoặc sai X-Identity-Secret.", 401);
  const body = await readJson(request);
  if (!body || typeof body !== "object") return errorJson("BAD_JSON", "Dữ liệu gửi lên không hợp lệ.", 400);

  const next = { ...(await getPromotion(env)), ...body };

  if (typeof next.enabled !== "boolean") return errorJson("INVALID_CONFIG", "enabled phải là boolean.", 422);
  const s = Date.parse(next.startsAt);
  const e = Date.parse(next.endsAt);
  if (!Number.isFinite(s) || !Number.isFinite(e) || s >= e)
    return errorJson("INVALID_CONFIG", "startsAt/endsAt không hợp lệ (cần ISO 8601 và startsAt < endsAt).", 422);
  if (!["go", "plus"].includes(next.trialTier))
    return errorJson("INVALID_CONFIG", "trialTier chỉ nhận 'go' hoặc 'plus'.", 422);
  if (!Number.isInteger(next.trialDays) || next.trialDays < 1 || next.trialDays > 90)
    return errorJson("INVALID_CONFIG", "trialDays phải là số nguyên 1..90.", 422);
  if (!(Number(next.purchaseBonusPercent) >= 0 && Number(next.purchaseBonusPercent) <= 200))
    return errorJson("INVALID_CONFIG", "purchaseBonusPercent phải trong khoảng 0..200.", 422);

  await env.DB.prepare(
    "INSERT INTO meta (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  )
    .bind(PROMO_META_KEY, JSON.stringify(next))
    .run();
  return json({ ok: true, config: next });
}

export function onRequest() {
  return errorJson("METHOD_NOT_ALLOWED", "Chỉ hỗ trợ GET/POST.", 405);
}
