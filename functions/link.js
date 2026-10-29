// GET /link?code=... — trang "ket noi app": hien ma + huong dan dan vao app.
// Trang tinh + fetch /api/auth/me: chua dang nhap thi moi dang nhap truoc.
export function onRequestGet() {
  return new Response(PAGE, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

const PAGE = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kết nối ứng dụng — HORA</title>
<link rel="icon" href="/favicon.ico">
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0b0d12;color:#e8eaed;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}
  .card{background:#151923;border:1px solid #232838;border-radius:14px;max-width:560px;width:100%;padding:28px}
  h1{margin:0 0 8px;font-size:22px}
  p{color:#9aa4b2;line-height:1.6;margin:8px 0}
  .code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:26px;letter-spacing:2px;background:#0b0d12;border:1px dashed #3a4256;border-radius:10px;padding:18px;text-align:center;margin:18px 0;user-select:all}
  button{background:#2563eb;color:#fff;border:0;border-radius:8px;padding:12px 18px;font-size:15px;cursor:pointer}
  button.ghost{background:transparent;border:1px solid #3a4256;color:#cbd5e1}
  .row{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}
  .err{color:#f87171}
  ol{color:#9aa4b2;line-height:1.8;padding-left:20px}
</style>
</head>
<body>
<div class="card">
  <h1>Kết nối ứng dụng HORA</h1>
  <div id="app"></div>
</div>
<script>
  const params = new URLSearchParams(location.search);
  const code = (params.get("code") || "").trim().toUpperCase();
  const el = document.getElementById("app");

  async function boot(){
    const me = await fetch("/api/auth/me", { credentials: "same-origin" });
    if (me.status === 401) {
      const back = encodeURIComponent("/link?code=" + encodeURIComponent(code));
      location.href = "/account.html?next=" + back;
      return;
    }
    if (!code) { el.innerHTML = '<p class="err">Thiếu mã kết nối trong liên kết.</p>'; return; }
    el.innerHTML = [
      '<p>Dán mã dưới đây vào ứng dụng HORA trên máy của bạn để kết nối tài khoản:</p>',
      '<div class="code" id="codebox">' + code + '</div>',
      '<ol>',
        '<li>Mở ứng dụng HORA (Video Builder).</li>',
        '<li>Bấm <b>Kết nối tài khoản</b>.</li>',
        '<li>Dán mã trên vào ô mã kết nối và xác nhận.</li>',
      '</ol>',
      '<div class="row">',
        '<button id="copy">Sao chép mã</button>',
        '<a class="ghost" style="text-decoration:none;padding:12px 18px;border:1px solid #3a4256;border-radius:8px;color:#cbd5e1" href="/account.html">Về trang tài khoản</a>',
      '</div>',
      '<p style="color:#6b7280;font-size:13px;margin-top:16px">Mã hết hạn sau 10 phút và chỉ dùng được một lần.</p>',
    ].join("");
    document.getElementById("copy").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(code); document.getElementById("copy").textContent = "Đã sao chép"; }
      catch { document.getElementById("copy").textContent = "Chọn mã và copy thủ công"; }
    });
  }
  boot();
</script>
</body>
</html>`;
