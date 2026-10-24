// Cloudflare Pages Function — chạy tại đường /releases-latest trên chính domain web.
//
// Vì sao cần: file latest.json nằm ở releases.hora.works (khác domain với web)
// và KHÔNG trả header CORS, nên trình duyệt chặn không cho trang web fetch trực tiếp.
// Function này fetch thay ở phía server (không bị CORS), đồng thời thay host
// placeholder "<domain>" trong JSON bằng host thật releases.hora.works,
// rồi trả JSON về cùng domain với web.
const UPSTREAM = "https://releases.hora.works/hora.media/latest.json";
const REAL_HOST = "https://releases.hora.works/";

export async function onRequest() {
  try {
    const res = await fetch(UPSTREAM, { cf: { cacheTtl: 60, cacheEverything: true } });
    if (!res.ok) {
      return new Response(JSON.stringify({ error: "upstream " + res.status }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }
    const text = (await res.text()).replaceAll("https://<domain>/", REAL_HOST);
    return new Response(text, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60",
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}
