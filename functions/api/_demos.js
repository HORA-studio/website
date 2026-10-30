// ============================================================================
// VIDEO MAU (Demo) — danh sach video o muc "Thu vien y tuong" trang chu.
// Du lieu THAT nam trong D1 (bang demo_videos, xem db/schema.sql +
// db/migrate-demo-videos-2026-10-30.sql) de doi video KHONG can sua code /
// deploy lai:
//   - Khach xem:  GET /api/demos               (chi video dang bat)
//   - Quan tri:   GET/POST/DELETE /api/internal/demos (X-Identity-Secret)
//   hoac sua truc tiep bang demo_videos trong D1 console.
// Loi doc DB / bang chua migrate / bang rong -> dung DEFAULT_DEMOS (fail-soft,
// trang chu khong bao gio trong phan demo).
//
// Moi video: { id, title, type (nhom phan loai), desc, videoUrl, image,
//   sortOrder, enabled, meta }
//   - videoUrl: link MP4/WebM truc tiep, hoac link YouTube/Vimeo (frontend tu
//     nhung iframe). De trong = chua co video, the van hien anh + tieu de va
//     cua so xem bao "dang cap nhat".
//   - image: anh poster/thumbnail cua the (va lam poster khi phat video).
//   - meta: object JSON tuy y (luu trong cot meta cua DB). Dung cho thong tin
//     phu cua tung video, vd { size: "16:9" | "9:16" | "1:1" } de frontend chon
//     khung hien thi. meta.size duoc bom ra ngoai o publicDemo().
// ============================================================================

export const DEFAULT_DEMOS = [
  {
    id: "thoi-trang-toi-gian",
    title: "Thời trang tối giản",
    type: "Fashion",
    desc: "Nhấn vào chất liệu và kiểu dáng",
    videoUrl: "https://releases.hora.works/hora.website/video_demo/900f7adea434407282522a460479cade.mp4",
    image: "",
    sortOrder: 1,
    enabled: true,
    meta: { size: "16:9" },
  },
  {
    id: "am-dun-nuoc",
    title: "Ấm đun nước nhà bếp",
    type: "Home & Living",
    desc: "Sản phẩm trong không gian sống",
    videoUrl: "https://releases.hora.works/hora.website/video_demo/b9d5f06a450b4893984912bf433f6f24.mp4",
    image: "",
    sortOrder: 2,
    enabled: true,
    meta: { size: "16:9" },
  },
  {
    id: "serum-duong-da",
    title: "Serum dưỡng da",
    type: "Beauty / Skincare",
    desc: "Phong cách quảng cáo tinh tế",
    videoUrl: "https://releases.hora.works/hora.website/video_demo/d0d032397ce940889d20ed1ab7b78781.mp4",
    image: "",
    sortOrder: 3,
    enabled: true,
    meta: { size: "16:9" },
  },
  {
    id: "nuoc-hoa-cao-cap",
    title: "Nước hoa cao cấp",
    type: "Beauty / Lifestyle",
    desc: "Mood hình ảnh sang trọng",
    videoUrl: "https://releases.hora.works/hora.website/video_demo/e70bfada097f4a41be3237304a2c17be.mp4",
    image: "",
    sortOrder: 4,
    enabled: true,
    meta: { size: "16:9" },
  },
  {
    id: "vest-trang-doc",
    title: "Vest trắng thanh lịch — dọc 9:16",
    type: "Fashion",
    desc: "Định dạng dọc cho TikTok / Reels / Shorts",
    videoUrl: "https://releases.hora.works/hora.website/video_demo/08feef6fcfee4255827e16a35be09aa3.mp4",
    image: "",
    sortOrder: 5,
    enabled: true,
    meta: { size: "9:16" },
  },
  {
    id: "ao-dai-tet-doc",
    title: "Áo dài Tết — dọc 9:16",
    type: "Fashion",
    desc: "Định dạng dọc cho TikTok / Reels / Shorts",
    videoUrl: "https://releases.hora.works/hora.website/video_demo/49d187f0c1f446efa1d333d1f19051f9.mp4",
    image: "",
    sortOrder: 6,
    enabled: true,
    meta: { size: "9:16" },
  },
  {
    id: "pho-neon-doc",
    title: "Phố neon điện ảnh — dọc 9:16",
    type: "Cinematic",
    desc: "Định dạng dọc cho TikTok / Reels / Shorts",
    videoUrl: "https://releases.hora.works/hora.website/video_demo/682d168926074336b66a5b3999ef9755.mp4",
    image: "",
    sortOrder: 7,
    enabled: true,
    meta: { size: "9:16" },
  },
  {
    id: "bong-ro-doc",
    title: "Bóng rổ — dọc 9:16",
    type: "Sports",
    desc: "Định dạng dọc cho TikTok / Reels / Shorts",
    videoUrl: "https://releases.hora.works/hora.website/video_demo/a0cb2f7e5e214f3c9f6426b1615aabd7.mp4",
    image: "",
    sortOrder: 8,
    enabled: true,
    meta: { size: "9:16" },
  },
  {
    id: "cafe-pour-over-doc",
    title: "Café pour-over — dọc 9:16",
    type: "Food & Drink",
    desc: "Định dạng dọc cho TikTok / Reels / Shorts",
    videoUrl: "https://releases.hora.works/hora.website/video_demo/e24a15e55d694faba956a4647c56f27c.mp4",
    image: "",
    sortOrder: 9,
    enabled: true,
    meta: { size: "9:16" },
  },
  {
    id: "serum-duong-da-doc",
    title: "Serum dưỡng da — dọc 9:16",
    type: "Beauty / Skincare",
    desc: "Định dạng dọc cho TikTok / Reels / Shorts",
    videoUrl: "https://releases.hora.works/hora.website/video_demo/f11306e3d6824d68bda8c72cc0917c2f.mp4",
    image: "",
    sortOrder: 10,
    enabled: true,
    meta: { size: "9:16" },
  },
  {
    id: "nuoc-hoa-doc",
    title: "Nước hoa — dọc 9:16",
    type: "Beauty / Lifestyle",
    desc: "Định dạng dọc cho TikTok / Reels / Shorts",
    videoUrl: "https://releases.hora.works/hora.website/video_demo/fd47c785eb0e405eae5976864bb74164.mp4",
    image: "",
    sortOrder: 11,
    enabled: true,
    meta: { size: "9:16" },
  }
];

export function isHttpUrl(s) {
  return typeof s === "string" && /^https?:\/\/[^\s<>"]+$/i.test(s.trim());
}

// Chuan hoa meta: chi nhan object, gioi han kich thuoc JSON khi ghi DB.
export function normalizeMeta(raw) {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    try {
      const s = JSON.stringify(raw);
      if (s.length <= 2000) return JSON.parse(s);
    } catch {
      /* bo qua, tra ve {} */
    }
  }
  return {};
}

function parseMetaColumn(v) {
  if (!v) return {};
  if (typeof v === "object") return normalizeMeta(v);
  try {
    return normalizeMeta(JSON.parse(String(v)));
  } catch {
    return {};
  }
}

// Chuan hoa 1 dong video (tu request ghi cau hinh hoac tu DB).
export function normalizeDemo(raw, idx = 0) {
  const src = raw && typeof raw === "object" ? raw : {};
  const title = String(src.title || "").trim().slice(0, 200);
  const slug =
    String(src.id || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) ||
    title
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/đ/g, "d")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) ||
    `demo-${idx + 1}`;
  const videoUrl = String(src.videoUrl ?? src.video_url ?? "").trim().slice(0, 1000);
  const image = String(src.image ?? src.poster_url ?? "").trim().slice(0, 1000);
  // meta: nhan object meta san co; cho phep viet tat { size } o ngoai cung.
  const meta = normalizeMeta(src.meta ?? src.meta_json);
  if (!meta.size && src.size) meta.size = String(src.size).trim().slice(0, 40);
  return {
    id: slug,
    title,
    type: String(src.type ?? src.category ?? "").trim().slice(0, 120),
    desc: String(src.desc ?? src.description ?? "").trim().slice(0, 500),
    videoUrl,
    image,
    sortOrder: Number.isInteger(src.sortOrder)
      ? src.sortOrder
      : Number.isInteger(src.sort_order)
        ? src.sort_order
        : idx + 1,
    enabled: src.enabled === undefined ? true : !!src.enabled && src.enabled !== 0,
    meta,
  };
}

export function normalizeDemos(arr) {
  return (Array.isArray(arr) ? arr : [])
    .map((d, i) => normalizeDemo(d, i))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function rowToDemo(r, idx) {
  return normalizeDemo(
    {
      id: r.id,
      title: r.title,
      type: r.category,
      desc: r.description,
      videoUrl: r.video_url,
      image: r.poster_url,
      sortOrder: r.sort_order,
      enabled: r.enabled === 1 || r.enabled === true,
      meta: parseMetaColumn(r.meta),
    },
    idx
  );
}

// Doc danh sach video tu DB. includeDisabled=true -> lay ca video dang tat
// (cho endpoint quan tri). Bang chua co / rong / loi -> DEFAULT_DEMOS.
export async function getDemoVideos(env, { includeDisabled = false } = {}) {
  try {
    const { results } = await env.DB.prepare(
      "SELECT id, title, category, description, video_url, poster_url, sort_order, enabled, meta " +
        "FROM demo_videos ORDER BY sort_order ASC, created_at ASC"
    ).all();
    if (results && results.length) {
      const list = results.map(rowToDemo);
      // Co dong trong DB thi ton trong DB tuyet doi (ke ca khi tat het:
      // quan tri chu dong an thi trang chu khong tu hien lai mac dinh).
      return includeDisabled ? list : list.filter((d) => d.enabled);
    }
    // Bang chua migrate xong nhung rong: quan tri thay rong that, khach xem
    // fail-soft ve mac dinh.
    return includeDisabled ? [] : DEFAULT_DEMOS.map((d, i) => normalizeDemo(d, i));
  } catch {
    return includeDisabled ? [] : DEFAULT_DEMOS.map((d, i) => normalizeDemo(d, i));
  }
}

// Ban rut gon cho frontend trang chu (dung ten field ma index.html dang dung).
// meta.size duoc bom ra ngoai de the chon khung ngang/doc; van giu nguyen
// cac field cu nen frontend cu khong bi vo.
export function publicDemo(d) {
  const meta = d.meta && typeof d.meta === "object" ? d.meta : {};
  return {
    id: d.id,
    title: d.title,
    type: d.type,
    desc: d.desc,
    videoUrl: d.videoUrl,
    image: d.image,
    size: meta.size || "",
    meta,
  };
}

// Ghi TOAN BO danh sach vao DB (thay the): xoa dong cu, chen dong moi.
// Danh sach rong -> xoa het (frontend se fail-soft ve DEFAULT_DEMOS khi xem).
export async function replaceDemoVideos(env, list) {
  const now = new Date().toISOString();
  const stmts = [env.DB.prepare("DELETE FROM demo_videos")];
  for (const d of list) {
    stmts.push(
      env.DB.prepare(
        "INSERT INTO demo_videos (id, title, category, description, video_url, poster_url, sort_order, enabled, meta, created_at, updated_at) " +
          "VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)"
      ).bind(
        d.id,
        d.title,
        d.type || null,
        d.desc || null,
        d.videoUrl || "",
        d.image || null,
        d.sortOrder,
        d.enabled ? 1 : 0,
        d.meta && Object.keys(d.meta).length ? JSON.stringify(d.meta) : null,
        now
      )
    );
  }
  await env.DB.batch(stmts);
}
