// GET /api/team/messages?after=<id> — doc tin moi (cookie hoac khoa API).
// POST — dang tin: { body, kind?: 'chat'|'question', reply_to?: id }.
// @Ten trong noi dung duoc tu trich thanh mentions (khop danh sach thanh vien).
// Tin cu (kind NULL) coi la 'chat'.
import { json, errorJson, readJson } from "../_lib.js";
import { getSessionMember } from "./_team.js";

function parseMentions(raw) {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function shape(r) {
  return {
    id: r.id,
    name: r.name,
    body: r.body,
    mentions: parseMentions(r.mentions),
    kind: r.kind || "chat",
    status: r.status || null,
    reply_to: r.reply_to ?? null,
    created_at: r.created_at,
  };
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Trich @Ten khop ten thanh vien (khong phan biet hoa thuong, dung ranh gioi tu).
// "@Tất cả mọi người" hoac "@mọi người" (bo chot 13/11: muc chon tat ca trong
// bo chon @mention cua team.html) -> mentions = TOAN BO ten thanh vien.
async function extractMentions(env, text) {
  const { results } = await env.DB.prepare("SELECT name FROM team_members").all();
  const names = (results || []).map((row) => row.name);
  if (/@(tất cả mọi người|mọi người)(?![A-Za-z0-9_])/i.test(text)) return names;
  const found = [];
  for (const name of names) {
    const re = new RegExp("@" + escapeRegExp(name) + "(?![A-Za-z0-9_])", "i");
    if (re.test(text)) found.push(name);
  }
  return found;
}

export async function onRequestGet({ request, env }) {
  const me = await getSessionMember(env, request);
  if (!me) return errorJson("UNAUTHORIZED", "Chưa vào phòng.", 401);
  const after = Number(new URL(request.url).searchParams.get("after") || 0) || 0;
  const { results } = await env.DB.prepare(
    "SELECT id, name, body, mentions, kind, status, reply_to, created_at FROM team_messages WHERE id > ?1 ORDER BY id ASC LIMIT 200"
  ).bind(after).all();
  return json({ messages: (results || []).map(shape) });
}

export async function onRequestPost({ request, env }) {
  const me = await getSessionMember(env, request);
  if (!me) return errorJson("UNAUTHORIZED", "Chưa vào phòng.", 401);
  const body = await readJson(request);
  const text = String(body?.body || "").trim().slice(0, 2000);
  if (!text) return errorJson("BAD_INPUT", "Tin nhắn trống.", 400);
  const kind = body?.kind === "question" ? "question" : "chat";
  const status = kind === "question" ? "open" : null;
  const replyTo = Number.isInteger(body?.reply_to) && body.reply_to > 0 ? body.reply_to : null;
  const mentions = await extractMentions(env, text);
  const r = await env.DB.prepare(
    "INSERT INTO team_messages (name, body, mentions, kind, status, reply_to) VALUES (?1, ?2, ?3, ?4, ?5, ?6)"
  ).bind(me.name, text, JSON.stringify(mentions), kind, status, replyTo).run();
  return json({ id: r.meta?.last_row_id ?? null, mentions, kind, status, reply_to: replyTo });
}
