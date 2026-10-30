// GET /api/demos — danh sach video mau cho trang chu (muc "Thu vien y tuong").
// Du lieu doc tu D1 (bang demo_videos), chi tra video dang bat, sap xep theo
// sort_order. Doi video/thu tu/tieu de o DB la trang chu cap nhat theo,
// khong can deploy lai. Chua migrate bang -> tra danh sach mac dinh
// (functions/api/_demos.js, fail-soft).
import { json, errorJson } from "./_lib.js";
import { getDemoVideos, publicDemo } from "./_demos.js";

export async function onRequestGet({ env }) {
  const list = await getDemoVideos(env);
  return json(
    { demos: list.map(publicDemo) },
    200,
    // Cache ngan o CDN/trinh duyet de trang chu nhanh, doi DB xong toi da
    // 60 giay sau la thay ban moi.
    { "Cache-Control": "public, max-age=60" }
  );
}

export function onRequest() {
  return errorJson("METHOD_NOT_ALLOWED", "Chỉ hỗ trợ GET.", 405);
}
