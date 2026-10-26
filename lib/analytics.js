/**
 * Estadísticas de visitas del sitio público, propias y anónimas (mismo diseño que el IT portfolio).
 *
 * Privacidad:
 *  - Sin cookies ni almacenamiento en el navegador del visitante.
 *  - No se guarda la IP. Para contar visitantes únicos se guarda un hash de
 *    (sal del día + IP + navegador). La sal es aleatoria, cambia cada día y la
 *    del día anterior se borra, así que el hash no se puede revertir ni enlazar entre días.
 *  - El detalle se borra a los 90 días; antes se resume en `dir_daily_stats`, que sí se conserva.
 *
 * No se cuentan los bots ni las visitas con una sesión del panel abierta.
 * Datos en Turso (libSQL): TURSO_DATABASE_URL y TURSO_AUTH_TOKEN. Sin ellas, las estadísticas se desactivan.
 */
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@libsql/client";

const RETENTION_DAYS = 90;
const TIME_ZONE = "America/Puerto_Rico";
const MAX_PER_VISITOR_DAY = 60; // tope de registros por visitante y día (evita abusos)

const BOT_RE = /bot|crawl|spider|slurp|archiver|preview|headless|lighthouse|pagespeed|monitor|uptime|curl|wget|python|java\/|go-http|axios|node-fetch|undici|facebookexternalhit|whatsapp|telegram|discord|slack|embedly/i;

const SOURCES = [
  [/google/i, "Google"],
  [/facebook|instagram|^fb$|\.fb\./i, "Facebook / Instagram"],
  [/whatsapp|wa\.me/i, "WhatsApp"],
  [/linkedin|lnkd/i, "LinkedIn"],
  [/reddit/i, "Reddit"],
  [/twitter|^t\.co$|^x\.com$/i, "X / Twitter"],
  [/github/i, "GitHub"],
  [/bing/i, "Bing"],
  [/duckduckgo/i, "DuckDuckGo"],
  [/yahoo/i, "Yahoo"],
  [/mail|outlook/i, "Email"],
];

const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const today = () => dayFmt.format(new Date());

function addDays(day, n) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

let client = null;
let schemaReady = null;

export function enabled() {
  return Boolean(process.env.TURSO_DATABASE_URL);
}

/** Datos no secretos para diagnosticar la conexión: dominio de la base y forma del token. */
export function connectionInfo() {
  const raw = String(process.env.TURSO_DATABASE_URL || "");
  const token = String(process.env.TURSO_AUTH_TOKEN || "");
  let host = "(URL no válida)";
  try { host = new URL(raw.trim()).host; } catch {}
  return {
    scheme: raw.trim().split(":")[0],
    host,
    urlHasSpaces: raw !== raw.trim() || /\s/.test(raw),
    tokenLength: token.length,
    tokenLooksJwt: /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(token.trim()),
    tokenHasSpaces: token !== token.trim(),
  };
}

async function db() {
  if (!client) client = createClient({ url: process.env.TURSO_DATABASE_URL.trim(), authToken: process.env.TURSO_AUTH_TOKEN?.trim() });
  schemaReady ||= client.batch([
    "CREATE TABLE IF NOT EXISTS dir_pageviews (day TEXT NOT NULL, visitor TEXT NOT NULL, source TEXT NOT NULL, device TEXT NOT NULL)",
    "CREATE INDEX IF NOT EXISTS dir_pageviews_day ON dir_pageviews (day)",
    "CREATE TABLE IF NOT EXISTS dir_searches (day TEXT NOT NULL, visitor TEXT NOT NULL, term TEXT NOT NULL, hits INTEGER NOT NULL)",
    "CREATE INDEX IF NOT EXISTS dir_searches_day ON dir_searches (day)",
    "CREATE TABLE IF NOT EXISTS dir_daily_stats (day TEXT PRIMARY KEY, views INTEGER NOT NULL, visitors INTEGER NOT NULL)",
    "CREATE TABLE IF NOT EXISTS dir_salts (day TEXT PRIMARY KEY, salt TEXT NOT NULL)",
  ], "write").catch((e) => { schemaReady = null; throw e; });
  await schemaReady;
  return client;
}

async function saltFor(c, day) {
  await c.execute({ sql: "INSERT OR IGNORE INTO dir_salts (day, salt) VALUES (?, ?)", args: [day, randomBytes(16).toString("hex")] });
  return (await c.execute({ sql: "SELECT salt FROM dir_salts WHERE day = ?", args: [day] })).rows[0].salt;
}

function classifySource(referrer, ref, host) {
  const named = (s) => (SOURCES.find(([re]) => re.test(s)) || [])[1];
  if (ref) return named(ref) || ref.charAt(0).toUpperCase() + ref.slice(1, 40);
  let hostname;
  try { hostname = new URL(referrer).hostname.replace(/^www\./, ""); } catch { return "Directo"; }
  if (!hostname || hostname === String(host).split(":")[0]) return "Directo";
  return named(hostname) || hostname.slice(0, 60);
}

function deviceOf(ua) {
  if (/iPad|Tablet|Android(?!.*Mobile)/i.test(ua)) return "Tablet";
  if (/Mobi|iPhone|Android/i.test(ua)) return "Móvil";
  return "Escritorio";
}

function clientIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0].trim();
}

let lastPurge = "";
async function purge(c) {
  const cutoff = addDays(today(), -RETENTION_DAYS);
  await c.batch([
    { sql: `INSERT INTO dir_daily_stats (day, views, visitors)
            SELECT day, COUNT(*), COUNT(DISTINCT visitor) FROM dir_pageviews WHERE day < ? GROUP BY day
            ON CONFLICT(day) DO UPDATE SET views = views + excluded.views, visitors = visitors + excluded.visitors`, args: [cutoff] },
    { sql: "DELETE FROM dir_pageviews WHERE day < ?", args: [cutoff] },
    { sql: "DELETE FROM dir_searches WHERE day < ?", args: [cutoff] },
    { sql: "DELETE FROM dir_salts WHERE day < ?", args: [today()] },
  ], "write");
}

/** Término de búsqueda normalizado: minúsculas, sin acentos ni espacios repetidos. */
export function normalizeTerm(q) {
  return String(q || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^\p{L}\p{N} .\-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

/**
 * Registra una visita o una búsqueda del sitio público.
 * @returns {Promise<boolean>} `true` si se contó.
 */
export async function record(req, body = {}) {
  const ua = String(req.headers["user-agent"] || "");
  if (!enabled() || !ua || BOT_RE.test(ua)) return false;

  const c = await db();
  const day = today();
  if (lastPurge !== day) { lastPurge = day; await purge(c); }
  const visitor = createHash("sha256").update(`${await saltFor(c, day)}|${clientIp(req)}|${ua}`).digest("hex").slice(0, 32);

  if (body.type === "search") {
    const term = normalizeTerm(body.q);
    if (term.length < 3) return false;
    const n = (await c.execute({ sql: "SELECT COUNT(*) AS n FROM dir_searches WHERE day = ? AND visitor = ?", args: [day, visitor] })).rows[0].n;
    if (n >= MAX_PER_VISITOR_DAY) return false;
    await c.execute({ sql: "INSERT INTO dir_searches (day, visitor, term, hits) VALUES (?, ?, ?, ?)", args: [day, visitor, term, Number(body.hits) > 0 ? 1 : 0] });
    return true;
  }

  const n = (await c.execute({ sql: "SELECT COUNT(*) AS n FROM dir_pageviews WHERE day = ? AND visitor = ?", args: [day, visitor] })).rows[0].n;
  if (n >= MAX_PER_VISITOR_DAY) return false;
  const source = classifySource(String(body.referrer || ""), String(body.ref || "").trim().slice(0, 40), req.headers.host);
  await c.execute({ sql: "INSERT INTO dir_pageviews (day, visitor, source, device) VALUES (?, ?, ?, ?)", args: [day, visitor, source, deviceOf(ua)] });
  return true;
}

/** Estadísticas para el panel. @param {number} days Días del periodo (7, 30 o 90). */
export async function getStats(days) {
  const c = await db();
  const end = today();
  const start = addDays(end, -(days - 1));
  const all = async (sql, args = []) => (await c.execute({ sql, args })).rows;

  // Desgloses: cuentan visitantes (día + hash), no recargas de página.
  const breakdown = async (col) => (await all(
    `SELECT ${col} AS label, COUNT(DISTINCT day || visitor) AS visitors FROM dir_pageviews
     WHERE day >= ? GROUP BY ${col} ORDER BY visitors DESC LIMIT 10`, [start]
  )).map((r) => ({ label: r.label, visitors: Number(r.visitors) }));
  // Búsquedas: cuántas personas distintas buscaron cada término.
  const terms = async (onlyMisses) => (await all(
    `SELECT term AS label, COUNT(DISTINCT day || visitor) AS visitors FROM dir_searches
     WHERE day >= ? ${onlyMisses ? "AND hits = 0" : ""} GROUP BY term ORDER BY visitors DESC, term LIMIT 10`, [start]
  )).map((r) => ({ label: r.label, visitors: Number(r.visitors) }));

  const [daily, sources, devices, searches, misses, archived, live] = await Promise.all([
    all("SELECT day, COUNT(*) AS views, COUNT(DISTINCT visitor) AS visitors FROM dir_pageviews WHERE day >= ? GROUP BY day", [start]),
    breakdown("source"),
    breakdown("device"),
    terms(false),
    terms(true),
    all("SELECT COALESCE(SUM(views), 0) AS views, COALESCE(SUM(visitors), 0) AS visitors FROM dir_daily_stats"),
    all("SELECT COUNT(*) AS views, (SELECT COALESCE(SUM(n), 0) FROM (SELECT COUNT(DISTINCT visitor) AS n FROM dir_pageviews GROUP BY day)) AS visitors FROM dir_pageviews"),
  ]);

  const perDay = new Map(daily.map((r) => [r.day, r]));
  const series = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const r = perDay.get(d);
    series.push({ day: d, views: r ? Number(r.views) : 0, visitors: r ? Number(r.visitors) : 0 });
  }
  const sum = (key) => series.reduce((n, r) => n + r[key], 0);
  const todayRow = series[series.length - 1];

  return {
    days,
    timeZone: TIME_ZONE,
    today: { views: todayRow.views, visitors: todayRow.visitors },
    period: { views: sum("views"), visitors: sum("visitors") },
    allTime: { views: Number(archived[0].views) + Number(live[0].views), visitors: Number(archived[0].visitors) + Number(live[0].visitors) },
    series,
    sources,
    devices,
    searches,
    misses,
  };
}
