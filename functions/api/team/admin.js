// Owner-only. GET /api/team/admin — nhat ky vao phong.
// POST /api/team/admin { action: 'add'|'revoke'|'unrevoke'|'reset', name }
// 'add' va 'reset' tra MA RO dung 1 lan trong response nay (D1 chi luu ban bam).
import { json, errorJson, readJson, sha256Hex } from "../_lib.js";
import { getSessionMember, randomCode } from "./_team.js";

async function requireOwner(env, request) {
  const me = await getSessionMember(env, request);
  if (!me) return { response: errorJson("UNAUTHORIZED", "Chưa vào phòng.", 401) };
  if (me.role !== "owner") return { response: errorJson("FORBIDDEN", "Chỉ chủ phòng.", 403) };
  return { me };
}

export async function onRequestGet({ request, env }) {
  const a = await requireOwner(env, request);
  if (a.response) return a.response;
  const { results } = await env.DB.prepare(
    "SELECT id, name, ok, created_at FROM team_access_log ORDER BY id DESC LIMIT 100"
  ).all();
  return json({ log: results || [] });
}

export async function onRequestPost({ request, env }) {
  const a = await requireOwner(env, request);
  if (a.response) return a.response;
  const body = await readJson(request);
  const action = String(body?.action || "");
  const name = String(body?.name || "").trim().slice(0, 40);
  if (!name) return errorJson("BAD_INPUT", "Thiếu tên thành viên.", 400);

  if (action === "add" || action === "reset") {
    const code = randomCode();
    const hash = await sha256Hex(code);
    if (action === "add") {
      const r = await env.DB.prepare(
        "INSERT OR IGNORE INTO team_members (name, role, code_hash) VALUES (?1, 'member', ?2)"
      ).bind(name, hash).run();
      if (!r.meta?.changes) return errorJson("EXISTS", "Tên này đã có. Dùng Đổi mã thay vì Thêm.", 409);
    } else {
      await env.DB.prepare("UPDATE team_members SET code_hash = ?2, revoked = 0 WHERE name = ?1")
        .bind(name, hash).run();
      await env.DB.prepare("DELETE FROM team_sessions WHERE name = ?1").bind(name).run();
    }
    return json({ name, code });
  }
  if (action === "revoke") {
    await env.DB.prepare("UPDATE team_members SET revoked = 1 WHERE name = ?1 AND role != 'owner'")
      .bind(name).run();
    await env.DB.prepare("DELETE FROM team_sessions WHERE name = ?1").bind(name).run();
    return json({ name, revoked: true });
  }
  if (action === "unrevoke") {
    await env.DB.prepare("UPDATE team_members SET revoked = 0 WHERE name = ?1").bind(name).run();
    return json({ name, revoked: false });
  }
  return errorJson("BAD_INPUT", "Hành động không hợp lệ.", 400);
}
