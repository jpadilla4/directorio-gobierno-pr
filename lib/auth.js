import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE = "pr_admin";
const MAX_AGE = 8 * 60 * 60; // 8 horas

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("Falta SESSION_SECRET");
  return s;
}

function sign(value) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

export function passwordMatches(input) {
  const real = process.env.ADMIN_PASSWORD;
  if (!real) return false;
  // Comparar huellas de igual longitud evita filtrar el largo de la contraseña
  return safeEqual(sign("pw:" + input), sign("pw:" + real));
}

export function sessionCookie() {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const token = `${exp}.${sign(String(exp))}`;
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${MAX_AGE}`;
}

export function clearCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export function isAdmin(req) {
  const raw = req.headers.cookie || "";
  const match = raw.split(/;\s*/).find((c) => c.startsWith(COOKIE + "="));
  if (!match) return false;
  const [exp, mac] = match.slice(COOKIE.length + 1).split(".");
  if (!exp || !mac || Number(exp) < Date.now() / 1000) return false;
  try {
    return safeEqual(mac, sign(exp));
  } catch {
    return false;
  }
}
