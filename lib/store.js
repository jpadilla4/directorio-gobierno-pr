import { readFile } from "node:fs/promises";
import { get, put, list, del } from "@vercel/blob";

const LINKS_PATH = "data/enlaces.json";
const SUG_PREFIX = "sugerencias/";
const opts = { access: "private" };

async function readBlobJson(pathname) {
  const r = await get(pathname, { ...opts, useCache: false });
  if (!r || r.statusCode !== 200) return null;
  const text = await new Response(r.stream).text();
  // Las respuestas comprimidas traen un ETag débil (W/"…"); ifMatch necesita el fuerte
  return { data: JSON.parse(text), etag: r.blob.etag.replace(/^W\//, "") };
}

async function seed() {
  const file = new URL("../data/enlaces-iniciales.json", import.meta.url);
  return JSON.parse(await readFile(file, "utf8"));
}

/** Directorio actual: el guardado por el admin o, si aún no existe, el inicial. */
export async function getDirectory() {
  const saved = await readBlobJson(LINKS_PATH);
  if (saved) return saved;
  return { data: await seed(), etag: null };
}

/** Aplica un cambio al directorio sin pisar uno simultáneo (reintenta si el ETag cambió). */
export async function updateDirectory(change) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, etag } = await getDirectory();
    const next = change(structuredClone(data));
    try {
      await put(LINKS_PATH, JSON.stringify(next), {
        ...opts,
        contentType: "application/json",
        addRandomSuffix: false,
        ...(etag ? { ifMatch: etag } : { allowOverwrite: false }),
      });
      return next;
    } catch (e) {
      if (attempt === 2) throw e;
    }
  }
}

export async function addSuggestion(s) {
  const id = new Date().toISOString().replace(/[:.]/g, "-") + "-" + Math.random().toString(36).slice(2, 8);
  await put(SUG_PREFIX + id + ".json", JSON.stringify({ id, ...s }), {
    ...opts,
    contentType: "application/json",
    addRandomSuffix: false,
  });
  return id;
}

export async function listSuggestions() {
  const blobs = [];
  let cursor;
  do {
    const page = await list({ prefix: SUG_PREFIX, cursor, limit: 1000 });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor && blobs.length < 2000);
  blobs.sort((a, b) => String(b.pathname).localeCompare(String(a.pathname)));
  const recent = blobs.slice(0, 300);
  const items = await Promise.all(recent.map(async (b) => (await readBlobJson(b.pathname))?.data));
  return items.filter(Boolean);
}

function sugPath(id) {
  if (!/^[\w-]{10,80}$/.test(id)) throw Object.assign(new Error("bad_id"), { status: 400 });
  return SUG_PREFIX + id + ".json";
}

export async function updateSuggestion(id, patch) {
  const current = await readBlobJson(sugPath(id));
  if (!current) return null;
  const next = { ...current.data, ...patch };
  await put(sugPath(id), JSON.stringify(next), {
    ...opts,
    contentType: "application/json",
    addRandomSuffix: false,
    ifMatch: current.etag,
  });
  return next;
}

export async function deleteSuggestion(id) {
  await del(sugPath(id));
}
