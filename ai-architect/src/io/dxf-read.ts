/**
 * قراءة ملفات DXF الحقيقية (أوتوكاد R12 حتى 2018) واستخراج الحدود المغلقة.
 * يدعم: LWPOLYLINE · POLYLINE (2D و3D) · LINE · ARC · CIRCLE · INSERT (كتل مع الإزاحة والمقياس والدوران)
 *       · نظام إحداثيات الكائن المقلوب (extrusion 0,0,-1) · ترميز ANSI_1256 العربي في الملفات القديمة.
 * الأرقام تُقرأ من النص كما هي (parseFloat) فلا يضيع أي رقم عشري.
 * الأقواس تُحوَّل لنقاط بحيث لا يزيد بعد الوتر عن القوس عن 1 ملم.
 */
import { Pt, Ring, area, cleanRing } from "../engine/geometry";

export interface DxfLoop { points: Ring; layer: string; type: string; hadArcs: boolean; closed: boolean; area: number; fromBlock?: string }
export interface DxfResult { loops: DxfLoop[]; open: number; layers: string[]; units: number | null; version: string; warnings: string[]; entityCount: Record<string, number> }

const SAGITTA = 0.001;
type Pair = [number, string];

/** فك ترميز الملف: UTF-8 للحديث، و windows-1256 للقديم العربي */
export function decodeDxf(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, Math.min(bytes.length, 40000)));
  const ver = (head.match(/\$ACADVER\s*\r?\n\s*1\s*\r?\n\s*(AC\d+)/) || [])[1] || "";
  const cp = ((head.match(/\$DWGCODEPAGE\s*\r?\n\s*3\s*\r?\n\s*(\S+)/) || [])[1] || "").toUpperCase();
  const modern = ver >= "AC1021";
  if (!modern && /1256/.test(cp)) { try { return new TextDecoder("windows-1256").decode(bytes); } catch (e) { /* */ } }
  return new TextDecoder("utf-8").decode(bytes);
}
const unescapeU = (s: string) => s.replace(/\\U\+([0-9A-Fa-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

function pairsOf(text: string): Pair[] {
  const L = text.replace(/^﻿/, "").split(/\r\n|\r|\n/), out: Pair[] = [];
  for (let i = 0; i + 1 < L.length; i += 2) {
    const c = parseInt(L[i].trim(), 10);
    if (Number.isNaN(c)) { i -= 1; continue; }
    out.push([c, L[i + 1].trim()]);
  }
  return out;
}

interface Ent { type: string; g: Pair[] }
function entitiesOf(P: Pair[], from: number, to: number): Ent[] {
  const out: Ent[] = [];
  let cur: Ent | null = null;
  for (let k = from; k < to; k++) {
    const [c, v] = P[k];
    if (c === 0) { if (cur) out.push(cur); cur = { type: v, g: [] }; } else if (cur) cur.g.push([c, v]);
  }
  if (cur) out.push(cur);
  return out;
}
const num = (g: Pair[], c: number, def = 0) => { const p = g.find(x => x[0] === c); return p ? parseFloat(p[1]) : def; };
const str = (g: Pair[], c: number, def = "") => { const p = g.find(x => x[0] === c); return p ? p[1] : def; };

function arcPts(cx: number, cy: number, R: number, a0: number, sweep: number): Pt[] {
  const step = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - SAGITTA / Math.max(R, 1e-9))));
  const n = Math.max(2, Math.ceil(Math.abs(sweep) / Math.max(step, 1e-3))), out: Pt[] = [];
  for (let k = 0; k <= n; k++) { const t = a0 + sweep * k / n; out.push([cx + R * Math.cos(t), cy + R * Math.sin(t)]); }
  return out;
}
function bulgeArc(a: Pt, b: Pt, bulge: number): Pt[] {
  const th = 4 * Math.atan(bulge), c = Math.hypot(b[0] - a[0], b[1] - a[1]); if (c < 1e-12 || Math.abs(th) < 1e-12) return [];
  const R = c / (2 * Math.sin(Math.abs(th) / 2)), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, ux = (b[0] - a[0]) / c, uy = (b[1] - a[1]) / c;
  const h = R * Math.cos(Math.abs(th) / 2) * Math.sign(bulge), cx = mx - uy * h, cy = my + ux * h;
  const pts = arcPts(cx, cy, R, Math.atan2(a[1] - cy, a[0] - cx), th);
  return pts.slice(1, -1);   // بدون الطرفين (موجودان كرؤوس)
}

type Xf = (p: Pt) => Pt;
const ID: Xf = p => p;

export function parseDXF(input: string | ArrayBuffer | Uint8Array): DxfResult {
  const text = typeof input === "string" ? input : decodeDxf(input);
  const P = pairsOf(text), warnings: string[] = [], count: Record<string, number> = {};
  let units: number | null = null, version = "";
  const sections: Record<string, [number, number]> = {};
  for (let k = 0; k < P.length; k++) {
    if (P[k][0] === 0 && P[k][1] === "SECTION" && P[k + 1] && P[k + 1][0] === 2) {
      const name = P[k + 1][1]; let e = k + 2; while (e < P.length && !(P[e][0] === 0 && P[e][1] === "ENDSEC")) e++;
      sections[name] = [k + 2, e]; k = e;
    }
  }
  if (sections.HEADER) {
    const [a, b] = sections.HEADER;
    for (let k = a; k < b; k++) {
      if (P[k][0] === 9 && P[k][1] === "$INSUNITS" && P[k + 1]) units = parseInt(P[k + 1][1], 10);
      if (P[k][0] === 9 && P[k][1] === "$ACADVER" && P[k + 1]) version = P[k + 1][1];
    }
  }
  const layers = new Set<string>();
  if (sections.TABLES) { const [a, b] = sections.TABLES; let inLayer = false; for (let k = a; k < b; k++) { const [c, v] = P[k]; if (c === 0) inLayer = v === "LAYER"; else if (inLayer && c === 2) layers.add(unescapeU(v)); } }

  // الكتل
  const blocks = new Map<string, { base: Pt; ents: Ent[] }>();
  if (sections.BLOCKS) {
    const ents = entitiesOf(P, ...sections.BLOCKS);
    let cur: { name: string; base: Pt; ents: Ent[] } | null = null;
    for (const e of ents) {
      if (e.type === "BLOCK") cur = { name: unescapeU(str(e.g, 2)), base: [num(e.g, 10), num(e.g, 20)], ents: [] };
      else if (e.type === "ENDBLK") { if (cur) blocks.set(cur.name, cur); cur = null; }
      else if (cur) cur.ents.push(e);
    }
  }

  const loops: DxfLoop[] = [], segs: Array<{ pts: Pt[]; layer: string; arc: boolean; block?: string }> = [];
  let open = 0;

  function ocs(g: Pair[], xf: Xf): Xf {
    const nz = num(g, 230, 1);
    if (nz < 0) { const nx = num(g, 210, 0), ny = num(g, 220, 0); if (Math.abs(nx) < 1 / 64 && Math.abs(ny) < 1 / 64) return p => xf([-p[0], p[1]]); warnings.push("عنصر بنظام إحداثيات مائل في الفراغ تم تجاهل ميله."); }
    return xf;
  }
  function polyline(pts: Pt[], bul: number[], closed: boolean, layer: string, type: string, xf: Xf, block?: string) {
    if (!closed && pts.length > 3) { const f = pts[0], l = pts[pts.length - 1]; if (Math.abs(f[0] - l[0]) < 1e-9 && Math.abs(f[1] - l[1]) < 1e-9) { pts = pts.slice(0, -1); bul = bul.slice(0, -1); closed = true; } }
    const hadArcs = bul.some(b => Math.abs(b) > 1e-12), out: Pt[] = [];
    for (let i = 0; i < pts.length; i++) {
      out.push(pts[i]);
      const j = i + 1 < pts.length ? i + 1 : closed ? 0 : -1;
      if (j >= 0 && Math.abs(bul[i]) > 1e-12) out.push(...bulgeArc(pts[i], pts[j], bul[i]));
    }
    const w = out.map(xf);
    if (closed) { const r = cleanRing(w); if (r.length >= 3) loops.push({ points: r, layer, type, hadArcs, closed: true, area: area(r), fromBlock: block }); }
    else if (w.length >= 2) segs.push({ pts: w, layer, arc: hadArcs, block });
  }

  function walk(ents: Ent[], xf: Xf, depth: number, block?: string, parentLayer?: string) {
    for (let k = 0; k < ents.length; k++) {
      const e = ents[k], g = e.g; count[e.type] = (count[e.type] || 0) + 1;
      let layer = unescapeU(str(g, 8, "0")); if (layer === "0" && parentLayer) layer = parentLayer;
      if (e.type === "LWPOLYLINE") {
        const pts: Pt[] = [], bul: number[] = []; let x: number | null = null;
        for (const [c, v] of g) { if (c === 10) x = parseFloat(v); else if (c === 20 && x !== null) { pts.push([x, parseFloat(v)]); bul.push(0); x = null; } else if (c === 42 && pts.length) bul[pts.length - 1] = parseFloat(v) || 0; }
        polyline(pts, bul, (num(g, 70) & 1) === 1, layer, "LWPOLYLINE", ocs(g, xf), block);
      } else if (e.type === "POLYLINE") {
        const flag = num(g, 70), pts: Pt[] = [], bul: number[] = [];
        let j = k + 1;
        for (; j < ents.length && ents[j].type === "VERTEX"; j++) { const vg = ents[j].g, vf = num(vg, 70); if (vf & 16) continue; pts.push([num(vg, 10), num(vg, 20)]); bul.push(num(vg, 42)); }
        if (j < ents.length && ents[j].type === "SEQEND") j++;
        k = j - 1;
        if (flag & (16 | 64)) { warnings.push("تم تجاهل سطح ثلاثي الأبعاد (Polyface/Mesh)."); continue; }
        polyline(pts, bul, (flag & 1) === 1, layer, (flag & 8) ? "POLYLINE 3D" : "POLYLINE", (flag & 8) ? xf : ocs(g, xf), block);
      } else if (e.type === "LINE") {
        segs.push({ pts: [xf([num(g, 10), num(g, 20)]), xf([num(g, 11), num(g, 21)])], layer, arc: false, block });
      } else if (e.type === "ARC") {
        const t = ocs(g, xf), a0 = num(g, 50) * Math.PI / 180; let a1 = num(g, 51) * Math.PI / 180; if (a1 <= a0) a1 += 2 * Math.PI;
        segs.push({ pts: arcPts(num(g, 10), num(g, 20), num(g, 40), a0, a1 - a0).map(t), layer, arc: true, block });
      } else if (e.type === "CIRCLE") {
        const t = ocs(g, xf), r = cleanRing(arcPts(num(g, 10), num(g, 20), num(g, 40), 0, 2 * Math.PI).slice(0, -1).map(t));
        loops.push({ points: r, layer, type: "CIRCLE", hadArcs: true, closed: true, area: area(r), fromBlock: block });
      } else if (e.type === "INSERT") {
        const b = blocks.get(unescapeU(str(g, 2))); if (!b || depth > 4) continue;
        const ix = num(g, 10), iy = num(g, 20), sx = num(g, 41, 1), sy = num(g, 42, 1), rot = num(g, 50) * Math.PI / 180, c = Math.cos(rot), s = Math.sin(rot);
        const t = ocs(g, xf);
        const bx: Xf = p => { const x = (p[0] - b.base[0]) * sx, y = (p[1] - b.base[1]) * sy; return t([ix + x * c - y * s, iy + x * s + y * c]); };
        walk(b.ents, bx, depth + 1, str(g, 2), layer);
      }
    }
  }
  if (sections.ENTITIES) walk(entitiesOf(P, ...sections.ENTITIES), ID, 0);

  // ربط الخطوط والأقواس المتصلة في حلقات مغلقة (لكل طبقة)
  const TOL = 1e-5, same = (p: Pt, q: Pt) => Math.abs(p[0] - q[0]) <= TOL && Math.abs(p[1] - q[1]) <= TOL;
  const byLayer = new Map<string, typeof segs>();
  segs.forEach(s => { const a = byLayer.get(s.layer) || []; a.push(s); byLayer.set(s.layer, a); });
  for (const [layer, list] of byLayer) {
    const left = list.slice();
    while (left.length) {
      const first = left.shift() as (typeof segs)[0], chain = first.pts.slice(); let arc = first.arc, grown = true;
      while (grown && !same(chain[0], chain[chain.length - 1])) {
        grown = false;
        for (let k = 0; k < left.length; k++) {
          const s = left[k], end = chain[chain.length - 1];
          if (same(s.pts[0], end)) { chain.push(...s.pts.slice(1)); } else if (same(s.pts[s.pts.length - 1], end)) { chain.push(...s.pts.slice(0, -1).reverse()); } else continue;
          arc = arc || s.arc; left.splice(k, 1); grown = true; break;
        }
      }
      if (chain.length >= 4 && same(chain[0], chain[chain.length - 1])) { const r = cleanRing(chain.slice(0, -1)); if (r.length >= 3) loops.push({ points: r, layer, type: "LINE/ARC", hadArcs: arc, closed: true, area: area(r) }); }
      else open++;
    }
  }
  if (loops.some(l => l.hadArcs)) warnings.push("في الحدود أقواس، حُوِّلت إلى نقاط بدقة 1 ملم.");
  return { loops: loops.sort((a, b) => b.area - a.area), open, layers: [...layers], units, version, warnings, entityCount: count };
}

export const UNIT_NAMES: Record<number, string> = { 0: "بدون وحدة", 1: "إنش", 2: "قدم", 4: "ملم", 5: "سم", 6: "متر", 7: "كم" };
