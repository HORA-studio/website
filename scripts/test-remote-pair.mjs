// Kiểm chứng contract website <-> app cho luồng ghép nối Remote khi ĐANG có
// phiên chạy. Dựng mock server đóng vai app (đúng hình dạng phản hồi của
// RemoteWebServer.cs) rồi chạy LẠI chuỗi gọi HTTP y như account.html làm.
//
// Trọng tâm regression: bản cũ poll /remote/pair/status?account=&code= (app
// trả 400 -> treo tới hết 2 phút); bản mới phải:
//   1. giữ requestId từ body 409,
//   2. poll /remote/pair/status?requestId=,
//   3. thấy status=approved thì POST /remote/pair lại để nhận token.
//
// Chạy: node website/scripts/test-remote-pair.mjs

import http from "node:http";
import assert from "node:assert/strict";

// ---------- Mock app: bắt chước RemoteWebServer.cs ----------
function startMockApp() {
  const state = {
    requests: [],
    approveAfterPolls: 1, // sau bao nhiêu lần poll status thì coi như đã duyệt
    polls: 0,
    requestId: "req-" + Math.random().toString(16).slice(2),
    token: "a".repeat(64),
    pending: false,
  };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    state.requests.push(req.method + " " + url.pathname + url.search);
    res.setHeader("Access-Control-Allow-Origin", "https://hora.works");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    const send = (code, obj) => {
      res.statusCode = code;
      res.end(JSON.stringify(obj));
    };
    if (req.method === "POST" && url.pathname === "/remote/pair") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const { account, code } = JSON.parse(body || "{}");
        if (code !== "482916") return send(401, { error: "mã ghép nối không đúng" });
        // Lần ghép lại sau khi duyệt -> phát token.
        if (state.pending && state.polls >= state.approveAfterPolls) {
          state.pending = false;
          return send(200, { token: state.token, account, message: "đã ghép nối" });
        }
        // Còn phiên đang chạy -> chặn, trả requestId.
        state.pending = true;
        return send(409, {
          error: "đã có phiên đang chạy — cần duyệt đổi phiên trên máy tính",
          requestId: state.requestId,
          account,
        });
      });
      return;
    }
    if (req.method === "GET" && url.pathname === "/remote/pair/status") {
      if (!url.searchParams.get("requestId")) {
        return send(400, { error: "thiếu requestId — vd /remote/pair/status?requestId=..." });
      }
      state.polls++;
      const approved = state.polls >= state.approveAfterPolls;
      return send(200, {
        requestId: url.searchParams.get("requestId"),
        status: approved ? "approved" : "pending",
      });
    }
    send(404, { error: "không tìm thấy" });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, base: `http://127.0.0.1:${port}`, state });
    });
  });
}

// ---------- Chạy lại thuật toán của account.html (không cần DOM) ----------
async function remoteFetchJson(url, opts) {
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => null);
  return { res, data };
}

// Bản ĐÃ SỬA (mô phỏng account.html hiện tại).
async function connectFixed(base, code, account, deadlineMs) {
  const { res, data: pd } = await remoteFetchJson(base + "/remote/pair", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account, code }),
  });
  if (res.status === 401 || res.status === 403) return { err: "app từ chối" };
  const token = pd && (pd.token || (pd.session && pd.session.token));
  if (token) return { token };
  const requestId = pd && pd.requestId;
  if (!requestId) return { err: "thiếu requestId" };
  // poll theo requestId; approved -> ghép lại để lấy token.
  while (Date.now() < deadlineMs) {
    const { data: d } = await remoteFetchJson(
      base + "/remote/pair/status?requestId=" + encodeURIComponent(requestId)
    );
    const st = d && String(d.status || "").toLowerCase();
    if (st === "approved") {
      const { data: rd } = await remoteFetchJson(base + "/remote/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account, code }),
      });
      const rToken = rd && (rd.token || (rd.session && rd.session.token));
      if (rToken) return { token: rToken };
    }
    if (["denied", "rejected", "expired"].includes(st)) return { err: "bị từ chối/hết hạn" };
    await new Promise((r) => setTimeout(r, 50));
  }
  return { err: "quá hạn chờ duyệt" };
}

// Bản CŨ (tái hiện bug): poll theo account&code, không re-pair.
async function connectBroken(base, code, account, deadlineMs) {
  const { res, data: pd } = await remoteFetchJson(base + "/remote/pair", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account, code }),
  });
  if (res.status === 401 || res.status === 403) return { err: "app từ chối" };
  const token = pd && pd.token;
  if (token) return { token };
  while (Date.now() < deadlineMs) {
    let d = null;
    try {
      const out = await remoteFetchJson(
        base + "/remote/pair/status?account=" + encodeURIComponent(account) + "&code=" + encodeURIComponent(code)
      );
      d = out.data;
    } catch {}
    const t = d && (d.token || (d.session && d.session.token));
    if (t) return { token: t };
    await new Promise((r) => setTimeout(r, 50));
  }
  return { err: "quá hạn chờ duyệt" };
}

let failures = 0;
function check(name, cond, extra = "") {
  if (cond) console.log("  PASS " + name);
  else {
    failures++;
    console.log("  FAIL " + name + (extra ? " — " + extra : ""));
  }
}

const { server, base, state } = await startMockApp();
try {
  console.log("Mock server:", base);

  console.log("\n[1] Bản CŨ (tái hiện bug) — poll account&code, không re-pair");
  const broken = await connectBroken(base, "482916", "demo@hora.works", Date.now() + 800);
  check("không lấy được token (đúng như báo cáo)", !!broken.err, JSON.stringify(broken));
  check(
    "app đã từng trả 400 vì thiếu requestId",
    state.requests.some((r) => r.includes("pair/status?account=")) 
  );

  // Reset trạng thái cho test bản mới.
  state.polls = 0;
  state.pending = false;
  state.requests.length = 0;

  console.log("\n[2] Bản MỚI — giữ requestId, poll requestId, re-pair lấy token");
  const fixed = await connectFixed(base, "482916", "demo@hora.works", Date.now() + 3000);
  check("nhận được token 64 hex", fixed.token === state.token, JSON.stringify(fixed));
  check(
    "poll status dùng requestId (không phải account&code)",
    state.requests.some((r) => r.includes("requestId=")) &&
      !state.requests.some((r) => r.includes("status?account="))
  );
  const pairPosts = state.requests.filter((r) => r.startsWith("POST /remote/pair"));
  check("ghép lại POST /remote/pair lần 2 (lần đầu + sau duyệt)", pairPosts.length >= 2, JSON.stringify(state.requests));
} finally {
  server.close();
}

console.log("");
if (failures > 0) {
  console.error(`THẤT BẠI: ${failures} kiểm tra không đạt`);
  process.exit(1);
}
console.log("TẤT CẢ KIỂM TRA ĐẠT");
