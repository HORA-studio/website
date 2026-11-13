// TẠM THỜI (workaround): Cloudflare Pages không phát hành file studio.html
// dù file có trên main — /studio.html trả 404 từ 2026-11-12 trong khi các
// file khác cùng commit vẫn lên bình thường (chưa rõ nguyên nhân phía
// deploy, cần xem tab Deployments). Middleware này tự phục vụ /studio.html
// và /studio bằng nội dung lấy trực tiếp từ GitHub (nhánh main) — sửa
// studio.html trên main là bản web cập nhật theo (cache tối đa ~5 phút).
// Khi nào Pages phát hành được file tĩnh bình thường thì XOÁ file này.
const RAW_URL = "https://raw.githubusercontent.com/HORA-studio/website/main/studio.html";

async function serveRaw(rawUrl, next) {
  try {
    const r = await fetch(rawUrl, {
      headers: { "User-Agent": "hora-pages-middleware" },
    });
    if (r.ok) {
      const html = await r.text();
      return new Response(html, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "public, max-age=300",
        },
      });
    }
  } catch {
    // Lỗi mạng tạm thời khi lấy file — rơi xuống hành vi mặc định bên dưới
  }
  return next();
}

export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);
  if (
    (url.pathname === "/studio.html" || url.pathname === "/studio") &&
    request.method === "GET"
  ) {
    return serveRaw(RAW_URL, next);
  }
  return next();
}
