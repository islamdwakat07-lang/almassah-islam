/* طبقة البيانات: استعلام مباشر من الخادم، أو من نسخة محفوظة على الجهاز (IndexedDB) تبقى حتى لو أُغلق الموقع */
"use strict";
const PG = "+proj=cass +lat_0=31.73409694444445 +lon_0=35.21208055555556 +x_0=170251.555 +y_0=126867.909 +a=6378300.789 +b=6356566.435 +towgs84=-275.722,94.7824,340.894,-8.001,-4.42,-11.821,1 +units=m +no_defs";
const ITM = "+proj=tmerc +lat_0=31.7343936111111 +lon_0=35.2045169444444 +k=1.0000067 +x_0=219529.584 +y_0=626907.39 +ellps=GRS80 +towgs84=-24.0024,-17.1032,-17.8444,-0.33077,-1.85269,1.66969,5.4248 +units=m +no_defs";
proj4.defs("EPSG:28191", PG); proj4.defs("EPSG:2039", ITM);
const SYS = { pg: "EPSG:28191", itm: "EPSG:2039", wgs: "EPSG:4326", web: "EPSG:3857" };
const conv = (from, to, p) => proj4(SYS[from], SYS[to], [p[0], p[1]]);
const webToPG = p => conv("web", "pg", p), pgToWeb = p => conv("pg", "web", p);
/* تعرّف تلقائي على نظام الإحداثيات من حجم الأرقام */
function guessSys(x, y) {
  if (Math.abs(x) <= 90 && Math.abs(y) <= 180) return Math.abs(x) > 33 ? "wgs-lonlat" : "wgs";   // خط عرض/طول
  if (y > 400000 && y < 900000) return "itm";
  if (y > 1e6) return x > 1e6 ? "web" : "itm";
  return "pg";
}

/* ---------- هندسة ---------- */
const ringArea = r => { let s = 0; for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; s += (a[0] - r[0][0]) * (b[1] - r[0][1]) - (b[0] - r[0][0]) * (a[1] - r[0][1]); } return s / 2; };
function pip(p, rings) {   // evenodd
  let inside = false;
  for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i], b = r[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
const bboxOf = g => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; const add = p => { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; };
  if (g.rings) g.rings.forEach(r => r.forEach(add)); else if (g.paths) g.paths.forEach(r => r.forEach(add)); else if (g.x != null) add([g.x, g.y]); return [x0, y0, x1, y1]; };
const bbHit = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
/* مضلع (حلقات) → MultiPolygon لمكتبة polygon-clipping */
const toMP = rings => { try { return rings.length === 1 ? [[rings[0]]] : polygonClipping.xor(...rings.map(r => [[r]])); } catch (e) { return [[rings[0]]]; } };
const mpArea = mp => mp.reduce((s, pg) => s + Math.abs(ringArea(pg[0])) - pg.slice(1).reduce((t, h) => t + Math.abs(ringArea(h)), 0), 0);

/* ---------- الخادم ---------- */
async function rq(url, params) {
  const r = await fetch(url, { method: "POST", body: new URLSearchParams(Object.assign({ f: "json" }, params)) });
  if (!r.ok) throw new Error("الخادم " + r.status);
  const j = await r.json(); if (j.error) throw new Error(j.error.message || "خطأ من الخادم"); return j;
}
const META = {};
async function meta(l) {
  if (META[l.k]) return META[l.k];
  let m = await DB.get("meta|" + l.k);
  if (!m) { try { m = await rq(l.url, {}); const { fields, geometryType, displayField } = m; m = { fields, geometryType, displayField }; DB.put("meta|" + l.k, m); } catch (e) { m = { fields: [] }; } }
  return (META[l.k] = m);
}
const geomParam = g => g.x != null
  ? { geometry: JSON.stringify({ x: g.x, y: g.y, spatialReference: { wkid: 102100 } }), geometryType: "esriGeometryPoint" }
  : g.env ? { geometry: g.env.join(","), geometryType: "esriGeometryEnvelope", inSR: 102100 }
  : { geometry: JSON.stringify({ rings: g.rings, spatialReference: { wkid: 102100 } }), geometryType: "esriGeometryPolygon" };
async function qOnline(l, g, where, geometry = true) {
  const out = []; let offset = 0;
  for (let k = 0; k < 20; k++) {
    const p = Object.assign({ where: where || "1=1", outFields: "*", returnGeometry: String(geometry), spatialRel: "esriSpatialRelIntersects", resultOffset: offset, resultRecordCount: 1000, inSR: 102100, outSR: 102100 }, g ? geomParam(g) : {});
    const j = await rq(l.url + "/query", p);
    (j.features || []).forEach(f => out.push({ a: f.attributes, g: f.geometry }));
    if (!j.exceededTransferLimit) break; offset += (j.features || []).length;
  }
  return out;
}

/* ---------- النسخة المحفوظة على الجهاز ---------- */
const DB = (() => {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((ok, no) => { const r = indexedDB.open("madani-v1", 1); r.onupgradeneeded = () => r.result.createObjectStore("kv"); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); }));
  const tx = async (mode, fn) => { const db = await open(); return new Promise((ok, no) => { const t = db.transaction("kv", mode), s = t.objectStore("kv"); const res = fn(s); t.oncomplete = () => ok(res && res.result); t.onerror = () => no(t.error); }); };
  return {
    get: k => tx("readonly", s => s.get(k)).catch(() => null),
    put: (k, v) => tx("readwrite", s => s.put(v, k)).catch(() => null),
    putMany: (entries) => tx("readwrite", s => { entries.forEach(([k, v]) => s.put(v, k)); }),
    clear: () => tx("readwrite", s => s.clear())
  };
})();
const CELL = 2000;   // شبكة 2 كم لقطع الأراضي (بإحداثيات 3857)
const cellOf = p => Math.floor(p[0] / CELL) + ":" + Math.floor(p[1] / CELL);
let OFF = null;      // معلومات النسخة المحفوظة {date, counts}
const MEM = {};      // طبقات محمّلة في الذاكرة من الجهاز
async function offInfo() { OFF = await DB.get("info"); return OFF; }
async function localLayer(k) {
  if (MEM[k]) return MEM[k];
  const a = (await DB.get("L|" + k)) || [];
  a.forEach(f => { f.b = bboxOf(f.g || {}); });
  return (MEM[k] = a);
}
const PCELL = {};
async function localParcelsAt(cells) {
  const out = [];
  for (const c of cells) {
    if (!PCELL[c]) { const a = (await DB.get("P|" + c)) || []; a.forEach(f => { f.b = bboxOf(f.g); }); PCELL[c] = a; }
    out.push(...PCELL[c]);
  }
  return out;
}
function cellsAround(bb) {
  const out = []; for (let x = Math.floor(bb[0] / CELL) - 1; x <= Math.floor(bb[2] / CELL) + 1; x++) for (let y = Math.floor(bb[1] / CELL) - 1; y <= Math.floor(bb[3] / CELL) + 1; y++) out.push(x + ":" + y);
  return out;
}
function featHits(f, g, gbb) {
  if (!f.g || !bbHit(f.b, gbb)) return false;
  if (g.env) return true;
  if (g.x != null) return f.g.rings ? pip([g.x, g.y], f.g.rings) : f.g.x != null ? Math.hypot(f.g.x - g.x, f.g.y - g.y) < 1 : false;
  if (!f.g.rings) return f.g.x != null ? pip([f.g.x, f.g.y], g.rings) : false;
  try { return polygonClipping.intersection(toMP(g.rings), toMP(f.g.rings)).length > 0; } catch (e) { return true; }
}
async function qLocal(l, g, filter) {
  const gbb = g ? (g.env || bboxOf(g)) : null;
  const src = l.k === "parcel" ? await localParcelsAt(g ? cellsAround(gbb) : []) : await localLayer(l.k);
  const seen = new Set(), out = [];
  for (const f of src) {
    if (filter && !filter(f.a)) continue;
    if (g && !featHits(f, g, gbb)) continue;
    const id = f.a.OBJECTID; if (id != null) { if (seen.has(id)) continue; seen.add(id); }
    out.push(f);
  }
  return out;
}
/* استعلام موحّد: المحفوظ أولاً إن وُجد، وإلا الخادم */
let PREFER_LOCAL = true;
async function query(l, g, where, filter) {
  if (OFF && PREFER_LOCAL && OFF.layers && OFF.layers[l.k] != null) return qLocal(l, g, filter);
  return qOnline(l, g, where);
}

/* تنزيل كل الطبقات للجهاز (كل الضفة) */
async function downloadAll(progress) {
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) {}
  const info = { date: Date.now(), layers: {} };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < LAYERS.length; i++) {
    const l = LAYERS[i];
    progress(l.n, i, LAYERS.length, 0, 0);
    const m = await rq(l.url, {}); await DB.put("meta|" + l.k, { fields: m.fields, geometryType: m.geometryType, displayField: m.displayField });
    const ids = ((await rq(l.url + "/query", { where: "1=1", returnIdsOnly: "true" })).objectIds || []).sort((a, b) => a - b);
    const isP = l.k === "parcel"; let buf = {}, nbuf = 0, all = [], gidx = {};
    const flush = async () => {
      const entries = [];
      for (const [c, arr] of Object.entries(buf)) { const old = (await DB.get("P|" + c)) || []; entries.push(["P|" + c, old.concat(arr)]); }
      if (entries.length) await DB.putMany(entries); buf = {}; nbuf = 0;
    };
    for (let k = 0; k < ids.length; k += 1000) {
      let j, tries = 0;
      for (;;) { try { j = await rq(l.url + "/query", { objectIds: ids.slice(k, k + 1000).join(","), outFields: "*", returnGeometry: "true", outSR: 102100 }); break; } catch (e) { if (++tries > 4) throw e; await sleep(1500 * tries); } }
      for (const f of j.features || []) {
        const r = { a: f.attributes, g: f.geometry };
        if (isP) {
          if (!f.geometry) continue; const b = bboxOf(f.geometry), c = cellOf([(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]);
          (buf[c] = buf[c] || []).push(r); nbuf++;
          const gk = f.attributes.GUSH_NO; (gidx[gk] = gidx[gk] || new Set()).add(c);
        } else all.push(r);
      }
      progress(l.n, i, LAYERS.length, Math.min(k + 1000, ids.length), ids.length);
      if (isP && nbuf >= 15000) await flush();
    }
    if (isP) { await flush(); await DB.put("Pidx", Object.fromEntries(Object.entries(gidx).map(([g, s]) => [g, [...s]]))); }
    else await DB.put("L|" + l.k, all);
    info.layers[l.k] = ids.length; delete MEM[l.k];
  }
  await DB.put("info", info); OFF = info; for (const k in PCELL) delete PCELL[k];
  return info;
}

/* ---------- القرى (للبحث بالحوض والقطعة) ---------- */
let VILLAGES = null;   // [{he, ar, g}]
async function villages() {
  if (VILLAGES) return VILLAGES;
  const cached = await DB.get("villages");
  if (cached) return (VILLAGES = cached);
  const [vs, names] = await Promise.all([query(LBY.village, null, "1=1"), query(LBY.namesP, null, "1=1")]);
  const pts = names.filter(n => n.g).map(n => ({ p: [n.g.x, n.g.y], ar: (n.a.settl_name_ar || n.a.arab_name || "").trim() }));
  VILLAGES = vs.filter(v => v.g && v.a.LAND).map(v => {
    const inside = pts.filter(p => pip(p.p, v.g.rings) && p.ar);
    return { he: v.a.LAND, ar: inside.map(p => p.ar).join(" / "), g: v.g };
  }).sort((a, b) => (a.ar || "ي" + a.he).localeCompare(b.ar || "ي" + b.he, "ar"));
  DB.put("villages", VILLAGES);
  return VILLAGES;
}
/* البحث عن قطعة: رقم الحوض كما في القطع (رقم الحوض الأصلي للبلدة) + رقم القطعة، داخل أراضي البلدة إن اختيرت */
async function findParcel(gush, parcel, village) {
  const where = `GUSH_NO = ${+gush}` + (parcel !== "" && parcel != null ? ` AND PARCEL = ${+parcel}` : "");
  const filt = a => a.GUSH_NO == +gush && (parcel === "" || parcel == null || a.PARCEL == +parcel);
  let res;
  if (OFF && PREFER_LOCAL && OFF.layers && OFF.layers.parcel != null) {
    const idx = (await DB.get("Pidx")) || {}; const cells = idx[+gush] || [];
    res = (await localParcelsAt(cells)).filter(f => filt(f.a));
    const seen = new Set(); res = res.filter(f => !seen.has(f.a.OBJECTID) && seen.add(f.a.OBJECTID));
  } else res = await qOnline(LBY.parcel, village ? { rings: village.g.rings } : null, where);
  if (village) res = res.filter(f => { const b = bboxOf(f.g); return pip([(b[0] + b[2]) / 2, (b[1] + b[3]) / 2], village.g.rings) || featHits({ g: f.g, b }, { rings: village.g.rings }, bboxOf(village.g)); });
  return res;
}
