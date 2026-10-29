// GET /api/payments/return — cong thanh toan dua trinh duyet khach quay ve day.
// CHI dieu huong ve trang tai khoan kem trang thai hien thi.
// TUYET DOI khong ghi 'paid' o day — chi IPN (server-to-server, da xac minh
// chu ky) moi duoc danh dau don da thanh toan.
export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const q = url.searchParams;
  const code = q.get("vnp_ResponseCode") ?? q.get("resultCode");
  let status = "pending";
  if (code === "00" || code === "0") status = "success";
  else if (code !== null && code !== "") status = "failed";

  const ref = q.get("vnp_TxnRef") || q.get("orderId") || "";
  const target = new URL("/account.html", url.origin);
  target.searchParams.set("payment", status);
  if (/^[A-Za-z0-9_-]+$/.test(ref)) target.searchParams.set("order", ref);
  return Response.redirect(target.toString(), 302);
}
