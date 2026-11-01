// GET /device?code=XXXX-XXXX — trang "dong y ket noi thiet bi" (kieu GitHub).
// Trang tinh + JS: chua dang nhap thi chuyen qua account.html dang nhap roi quay lai.
// User bam "Dong y" -> POST /api/identity/device/approve -> app dang poll nhan token.
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
<title>Kết nối thiết bị — HORA</title>
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
  .code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:28px;letter-spacing:3px;background:var(--panel2);border:1px dashed var(--line2);border-radius:14px;padding:18px;text-align:center;margin:18px 0;user-select:all;color:var(--text)}
  button{background:var(--gold);color:#fff;border:0;border-radius:999px;padding:12px 22px;font-size:15px;font-weight:650;cursor:pointer}
  button:hover{background:var(--gold2)}
  button.deny{background:transparent;color:var(--text);border:1px solid var(--line2)}
  button.deny:hover{background:var(--panel2)}
  button:disabled{opacity:.55;cursor:default}
  .row{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;align-items:center}
  .err{color:var(--danger)}
  .ok{color:var(--gold)}
  .note{color:var(--muted);font-size:13px;margin-top:16px}
  .app{font-weight:700;color:var(--text)}
  .who{font-size:13px;color:var(--muted)}
  .spinner{display:inline-block;width:16px;height:16px;border:2px solid var(--line2);border-top-color:var(--gold);border-radius:50%;animation:spin .8s linear infinite;vertical-align:-3px;margin-right:8px}
  @keyframes spin{to{transform:rotate(360deg)}}
</style>
</head>
<body>
<div class="card">
  <h1>Kết nối thiết bị với HORA</h1>
  <div id="app"><p><span class="spinner"></span>Đang tải…</p></div>
</div>
<script>
  const params = new URLSearchParams(location.search);
  const rawCode = (params.get("code") || "").trim().toUpperCase();
  const el = document.getElementById("app");
  const APP_NAMES = { "video-builder": "HORA Video Builder", "facebook-builder": "HORA Facebook Builder" };

  function normCode(s){
    const c = (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    return c.length === 8 ? c.slice(0,4) + "-" + c.slice(4) : "";
  }
  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"]/g, (m)=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[m])); }

  async function post(path, body){
    const res = await fetch(path, {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    let data = null; try { data = await res.json(); } catch {}
    return { res, data };
  }

  function renderError(msg){
    el.innerHTML = '<p class="err">' + esc(msg) + '</p>';
  }

  async function boot(){
    const code = normCode(rawCode);
    if (!code) { renderError("Thiếu hoặc sai mã kết nối trong liên kết."); return; }

    // Chua dang nhap -> dang nhap web truoc roi quay lai trang nay.
    const me = await fetch("/api/auth/me", { credentials: "same-origin" });
    if (me.status === 401) {
      const back = encodeURIComponent("/device?code=" + encodeURIComponent(code));
      location.href = "/account.html?next=" + back;
      return;
    }

    // Lay trang thai phien.
    let info = null;
    try {
      const r = await fetch("/api/identity/device/info?user_code=" + encodeURIComponent(code), { credentials: "same-origin" });
      info = await r.json();
      if (!r.ok) { renderError((info && info.error && info.error.message) || "Không tìm thấy phiên kết nối."); return; }
    } catch { renderError("Không kết nối được máy chủ, thử lại."); return; }

    const appName = APP_NAMES[info.app] || info.app;
    if (info.status === "approved") { renderDone("Thiết bị này đã được kết nối. Quay lại ứng dụng để tiếp tục."); return; }
    if (info.status === "denied") { renderError("Yêu cầu kết nối đã bị từ chối. Đóng trang này."); return; }
    if (info.status === "expired") { renderError("Mã kết nối đã hết hạn. Trong ứng dụng, bấm Kết nối lại."); return; }

    renderConfirm(code, appName);
  }

  function renderConfirm(code, appName){
    el.innerHTML = [
      '<p>Một thiết bị đang yêu cầu kết nối với tài khoản HORA của bạn:</p>',
      '<div class="code">' + esc(code) + '</div>',
      '<p>Ứng dụng: <span class="app">' + esc(appName) + '</span></p>',
      '<p class="who">Nếu mã trên khớp với mã hiển thị trong ứng dụng của bạn, hãy bấm Đồng ý.</p>',
      '<div class="row">',
        '<button id="ok">Đồng ý kết nối</button>',
        '<button id="no" class="deny">Từ chối</button>',
      '</div>',
      '<p class="note" id="status"></p>',
    ].join("");
    const ok = document.getElementById("ok");
    const no = document.getElementById("no");
    const status = document.getElementById("status");

    ok.addEventListener("click", async () => {
      ok.disabled = true; no.disabled = true; status.textContent = "Đang xử lý…";
      const { res, data } = await post("/api/identity/device/approve", { user_code: code });
      if (res.ok) { renderDone("Đã kết nối. Quay lại ứng dụng — nó sẽ tự đăng nhập trong giây lát."); return; }
      status.innerHTML = '<span class="err">' + esc((data && data.error && data.error.message) || "Không xử lý được, thử lại.") + '</span>';
      ok.disabled = false; no.disabled = false;
    });

    no.addEventListener("click", async () => {
      ok.disabled = true; no.disabled = true; status.textContent = "Đang xử lý…";
      const { res, data } = await post("/api/identity/device/deny", { user_code: code });
      if (res.ok) { renderError("Bạn đã từ chối kết nối. Đóng trang này."); return; }
      status.innerHTML = '<span class="err">' + esc((data && data.error && data.error.message) || "Không xử lý được, thử lại.") + '</span>';
      ok.disabled = false; no.disabled = false;
    });
  }

  function renderDone(msg){
    el.innerHTML = [
      '<p class="ok" style="font-weight:700;font-size:17px">✓ Đã kết nối</p>',
      '<p>' + esc(msg) + '</p>',
      '<div class="row"><a class="btn" href="/account.html" style="text-decoration:none;color:var(--gold);font-weight:650">Về trang tài khoản</a></div>',
    ].join("");
  }

  boot();
</script>
</body>
</html>`;
