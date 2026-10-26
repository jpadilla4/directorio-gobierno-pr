import { isAdmin } from "./auth.js";

export function send(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}

export function fail(res, status, error) {
  send(res, status, { error });
}

export async function readJson(req, limit = 20000) {
  if (req.body && typeof req.body === "object") return req.body;
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > limit) throw Object.assign(new Error("too_large"), { status: 413 });
  }
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw Object.assign(new Error("bad_json"), { status: 400 });
  }
}

// Bloquea peticiones de escritura desde otros sitios (además de SameSite=Strict en la cookie)
export function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

export function requireAdmin(req, res) {
  if (!isAdmin(req)) {
    fail(res, 401, "Tu sesión expiró. Vuelve a entrar al panel.");
    return false;
  }
  if (req.method !== "GET" && !sameOrigin(req)) {
    fail(res, 403, "Petición rechazada.");
    return false;
  }
  return true;
}

export function cleanText(v, max) {
  return String(v ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max);
}

export function cleanUrl(v) {
  try {
    const u = new URL(String(v).trim());
    return /^https?:$/.test(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}
