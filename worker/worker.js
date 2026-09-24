/**
 * RING_RP — Gemini AI proxy (Cloudflare Worker)
 *
 * Tarayıcı Gemini'ye doğrudan değil bu Worker'a istek atar; API key sadece
 * Cloudflare'de secret olarak durur, sayfanın kaynağında hiç görünmez.
 *
 * Secrets / vars (Cloudflare panel → Worker → Settings → Variables and Secrets):
 *   GEMINI_KEY       (secret, zorunlu)   — bu proje için ayrı açılmış Gemini API key
 *   ALLOWED_ORIGINS  (var)               — virgülle: https://kullanici.github.io,http://localhost:5500
 *   APP_TOKEN        (secret, isteğe bağlı) — istemcinin X-App-Token başlığında göndermesi gereken değer
 *   DEFAULT_MODEL    (var, isteğe bağlı) — örn. gemini-3.6-flash
 *   ALLOWED_MODELS   (var, isteğe bağlı) — virgülle izinli modeller; boşsa "gemini-" ile başlayan her model
 *   RATE_PER_MIN     (var, isteğe bağlı) — IP başına dakikalık istek sınırı (varsayılan 40)
 *
 * Endpoint'ler:
 *   GET  /health     → {ok:true}
 *   POST /generate   → body: {model?, system?, prompt? | contents?, json?, search?, temperature?, maxOutputTokens?}
 *                      yanıt: {text, sources[], model, usage}
 */

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';
const MAX_BODY = 64 * 1024;          // 64 KB istek sınırı
const hits = new Map();              // basit IP rate limit (isolate başına, en iyi çaba)

function corsHeaders(origin, env) {
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const ok = !allowed.length || allowed.includes(origin);
  return {
    ok,
    headers: {
      'Access-Control-Allow-Origin': ok && origin ? origin : (allowed[0] || '*'),
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,X-App-Token',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    },
  };
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } });
}

function rateLimited(ip, env) {
  const limit = parseInt(env.RATE_PER_MIN || '40', 10);
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter(t => now - t < 60_000);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > limit;
}

function buildGeminiBody(b) {
  const contents = Array.isArray(b.contents) && b.contents.length
    ? b.contents
    : [{ role: 'user', parts: [{ text: String(b.prompt || '') }] }];
  const body = {
    contents,
    generationConfig: {
      temperature: typeof b.temperature === 'number' ? Math.max(0, Math.min(2, b.temperature)) : 0.8,
      maxOutputTokens: Math.min(parseInt(b.maxOutputTokens || 4096, 10) || 4096, 8192),
    },
  };
  if (b.system) body.system_instruction = { parts: [{ text: String(b.system) }] };
  // Google Search grounding ile JSON modu her modelde birlikte çalışmıyor → search varsa JSON'u istemci metinden ayrıştırır
  if (b.search) body.tools = [{ google_search: {} }];
  else if (b.json) body.generationConfig.responseMimeType = 'application/json';
  return body;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin, env);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors.headers });
    if (url.pathname === '/health') return json({ ok: true, hasKey: !!env.GEMINI_KEY }, 200, cors.headers);
    if (url.pathname !== '/generate' || request.method !== 'POST') return json({ error: 'not_found' }, 404, cors.headers);

    if (!cors.ok) return json({ error: 'origin_not_allowed' }, 403, cors.headers);
    if (env.APP_TOKEN && request.headers.get('X-App-Token') !== env.APP_TOKEN) return json({ error: 'bad_token' }, 401, cors.headers);
    if (!env.GEMINI_KEY) return json({ error: 'server_missing_key' }, 500, cors.headers);

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (rateLimited(ip, env)) return json({ error: 'rate_limited' }, 429, cors.headers);

    const raw = await request.text();
    if (raw.length > MAX_BODY) return json({ error: 'body_too_large' }, 413, cors.headers);
    let b;
    try { b = JSON.parse(raw); } catch { return json({ error: 'bad_json' }, 400, cors.headers); }

    const model = String(b.model || env.DEFAULT_MODEL || 'gemini-3.6-flash');
    const allowedModels = (env.ALLOWED_MODELS || '').split(',').map(s => s.trim()).filter(Boolean);
    if (allowedModels.length ? !allowedModels.includes(model) : !/^gemini-[\w.-]+$/.test(model)) {
      return json({ error: 'model_not_allowed', model }, 400, cors.headers);
    }

    let res;
    try {
      res = await fetch(`${GEMINI_BASE}${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_KEY },
        body: JSON.stringify(buildGeminiBody(b)),
      });
    } catch (e) {
      return json({ error: 'upstream_unreachable', detail: String(e.message || e) }, 502, cors.headers);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return json({ error: 'upstream_error', status: res.status, detail: data?.error?.message || res.statusText }, res.status === 429 ? 429 : 502, cors.headers);
    }
    const cand = data.candidates?.[0];
    const text = (cand?.content?.parts || []).map(p => p.text || '').join('');
    const sources = (cand?.groundingMetadata?.groundingChunks || []).map(g => g.web?.uri).filter(Boolean);
    if (!text) return json({ error: 'empty_response', finishReason: cand?.finishReason || null }, 502, cors.headers);
    return json({ text, sources, model, usage: data.usageMetadata || null }, 200, cors.headers);
  },
};
