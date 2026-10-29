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
  :root{--bg:#f6f5f1;--panel:#ffffff;--panel2:#efede8;--line:#e3e0d8;--line2:#d8d4c9;--text:#14161a;--muted:#5f6a70;--gold:#0a9787;--gold2:#078a7b;--danger:#c93a32;--shadow:0 1px 2px #14161a08,0 16px 40px -16px #14161a1f;color-scheme:light}
  @media(prefers-color-scheme:dark){:root{--bg:#0a0c0f;--panel:#12151b;--panel2:#171b22;--line:#ffffff17;--line2:#ffffff24;--text:#eef2f3;--muted:#9fb0b5;--gold:#17dcc3;--gold2:#5ff0db;--danger:#ff8d85;--shadow:0 1px 2px #00000040,0 16px 40px -16px #00000080;color-scheme:dark}}
  *{box-sizing:border-box}
  body{font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:var(--bg);color:var(--text);margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}
  body:before{content:"";position:fixed;inset:0;pointer-events:none;background:radial-gradient(1000px 520px at 85% -10%,#0a978714,transparent 65%)}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:22px;max-width:560px;width:100%;padding:28px;box-shadow:var(--shadow);position:relative}
  h1{margin:0 0 8px;font-size:22px;font-weight:800;letter-spacing:-.02em}
  p{color:var(--muted);line-height:1.6;margin:8px 0}
  .code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:26px;letter-spacing:2px;background:var(--panel2);border:1px dashed var(--line2);border-radius:14px;padding:18px;text-align:center;margin:18px 0;user-select:all;color:var(--text)}
  button{background:var(--gold);color:#fff;border:0;border-radius:999px;padding:12px 22px;font-size:15px;font-weight:650;cursor:pointer}
  button:hover{background:var(--gold2)}
  .ghost{display:inline-flex;align-items:center;background:transparent;border:1px solid var(--line2);border-radius:999px;padding:12px 18px;color:var(--text);text-decoration:none;font-size:15px;font-weight:600}
  .row{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;align-items:center}
  .err{color:var(--danger)}
  .note{color:var(--muted);font-size:13px;margin-top:16px}
  ol{color:var(--muted);line-height:1.8;padding-left:20px}
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
        '<a class="ghost" href="/account.html">Về trang tài khoản</a>',
      '</div>',
      '<p class="note">Mã hết hạn sau 10 phút và chỉ dùng được một lần.</p>',
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
