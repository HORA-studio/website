// GET /api/team/members — danh sach thanh vien + lan vao gan nhat.
import { json, errorJson } from "../_lib.js";
import { getSessionMember } from "./_team.js";

export async function onRequestGet({ request, env }) {
  const me = await getSessionMember(env, request);
  if (!me) return errorJson("UNAUTHORIZED", "Chưa vào phòng.", 401);
  const { results } = await env.DB.prepare(
    "SELECT name, role, revoked, created_at, last_seen_at FROM team_members ORDER BY (role = 'owner') DESC, name ASC"
  ).all();
  return json({ me, members: results || [] });
}
