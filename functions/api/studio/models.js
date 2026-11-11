// GET /api/studio/models — danh muc model cho UI Studio (khong can dang nhap:
// chi la catalog). Khi da noi Dreamina Tool (STUDIO_TOOL_URL): lay model THAT
// tu tool (GET /api/models?type=image|video — schema CLI tra: model,
// displayName, modes[].flags gom ratio values + duration min/max/step),
// chuan hoa kem gia credit phia web + moc thoi luong de UI dung pill.
// Tool loi / chua noi / chua dang nhap Dreamina -> tra danh muc tinh du phong.
import { json } from "../_lib.js";
import { STUDIO_MODELS, toolBase } from "./_studio.js";

// Gia web tam cho model Dreamina khong co trong bang gia tinh.
const DEFAULT_PRICE = { image: { cost: 10 }, video: { cost: 6, perSecond: true } };

function priceFor(kind, id) {
  const m = (STUDIO_MODELS[kind] || []).find((x) => x.id === id);
  if (m) return m.costPerSecond ? { cost: m.costPerSecond, perSecond: true } : { cost: m.cost };
  return DEFAULT_PRICE[kind];
}

function durationMarks(f) {
  const min = Number(f.min), max = Number(f.max), step = Number(f.step) || 1;
  if (!isFinite(min) || !isFinite(max) || max < min) return null;
  const out = [];
  for (let v = min; v <= max && out.length < 8; v += step) out.push(Math.round(v * 100) / 100);
  if (out.length && out[out.length - 1] !== max && out.length < 8) out.push(max);
  return out.length ? out : null;
}

function normalize(items, kind) {
  return (items || []).map((it) => {
    const modes = it.modes || [];
    let durations = null, ratios = null;
    for (const m of modes) {
      for (const f of m.flags || []) {
        if (/duration/i.test(f.flag || "")) durations = durations || durationMarks(f);
        if ((f.flag === "ratio" || f.flag === "--ratio") && Array.isArray(f.values) && f.values.length) ratios = ratios || f.values;
      }
    }
    const p = priceFor(kind, it.model);
    return {
      id: it.model,
      name: it.displayName || it.model,
      desc: modes.some((m) => m.vipRequired) ? "Model Dreamina · cần gói VIP" : "Model Dreamina",
      cost: p.cost,
      ...(p.perSecond ? { perSecond: true } : {}),
      ...(durations ? { durations } : {}),
      ...(ratios ? { ratios } : {}),
    };
  }).filter((m) => m.id);
}

function staticCatalog() {
  const out = {};
  for (const kind of ["image", "video"]) {
    out[kind] = (STUDIO_MODELS[kind] || []).map((m) => ({
      id: m.id,
      name: m.name,
      desc: "",
      cost: m.costPerSecond || m.cost,
      ...(m.costPerSecond ? { perSecond: true } : {}),
      ...(kind === "video" ? { durations: [5, 10] } : {}),
    }));
  }
  return out;
}

export async function onRequestGet({ env }) {
  const base = toolBase(env);
  if (base) {
    try {
      const [ri, rv] = await Promise.all([
        fetch(base + "/api/models?type=image"),
        fetch(base + "/api/models?type=video"),
      ]);
      const di = await ri.json().catch(() => null);
      const dv = await rv.json().catch(() => null);
      const image = normalize(di && di.items, "image");
      const video = normalize(dv && dv.items, "video");
      if (image.length || video.length) return json({ source: "tool", image, video });
    } catch (e) { /* roi xuong danh muc du phong */ }
  }
  return json({ source: "static", ...staticCatalog() });
}
