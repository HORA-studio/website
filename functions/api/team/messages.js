// GET /api/team/messages?after=<id> — doc tin moi. POST — dang tin.
import { json, errorJson, readJson } from "../_lib.js";
import { getSessionMember } from "./_team.js";

export async function onRequestGet({ request, env }) {
  const me = await getSessionMember(env, request);
  if (!me) return errorJson("UNAUTHORIZED", "Chưa vào phòng.", 401);
  const after = Number(new URL(request.url).searchParams.get("after") || 0) || 0;
  const { results } = await env.DB.prepare(
    "SELECT id, name, body, created_at FROM team_messages WHERE id > ?1 ORDER BY id ASC LIMIT 200"
  ).bind(after).all();
  return json({ messages: results || [] });
}

export async function onRequestPost({ request, env }) {
  const me = await getSessionMember(env, request);
  if (!me) return errorJson("UNAUTHORIZED", "Chưa vào phòng.", 401);
  const body = await readJson(request);
  const text = String(body?.body || "").trim().slice(0, 2000);
  if (!text) return errorJson("BAD_INPUT", "Tin nhắn trống.", 400);
  const r = await env.DB.prepare(
    "INSERT INTO team_messages (name, body) VALUES (?1, ?2)"
  ).bind(me.name, text).run();
  return json({ id: r.meta?.last_row_id ?? null });
}
