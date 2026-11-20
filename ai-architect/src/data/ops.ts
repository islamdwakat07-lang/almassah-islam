/** عمليات تعديل المشروع: كل عملية ترجع نسخة جديدة (للتراجع والإعادة بلقطات) */
import { Project, Rules, EdgeSetting, normalize } from "./model";
import type { EdgeType } from "../engine/classify";

const clone = (p: Project): Project => JSON.parse(JSON.stringify(p));
const done = (p: Project) => { p.updatedAt = Date.now(); return normalize(p); };

export function addVertex(p: Project, x: number, y: number) { if (p.parcel.closed) return p; const q = clone(p); q.parcel.vertices.push({ x, y }); return done(q); }
export function removeLastVertex(p: Project) { if (p.parcel.closed || !p.parcel.vertices.length) return p; const q = clone(p); q.parcel.vertices.pop(); return done(q); }
export function closeParcel(p: Project) { if (p.parcel.vertices.length < 3 || p.parcel.closed) return p; const q = clone(p); q.parcel.closed = true; q.edges = []; q.streets = []; return done(q); }
export function moveVertex(p: Project, i: number, x: number, y: number) { if (!p.parcel.vertices[i]) return p; const q = clone(p); q.parcel.vertices[i] = { x, y }; return done(q); }

/** إدراج رأس على الضلع e: الضلعان الناتجان يرثان إعدادات الضلع الأصلي (والشارع) */
export function insertVertex(p: Project, e: number, x: number, y: number) {
  const n = p.parcel.vertices.length; if (e < 0 || e >= n) return p;
  const q = clone(p); q.parcel.vertices.splice(e + 1, 0, { x, y });
  if (q.parcel.closed) {
    const s: EdgeSetting = q.edges[e] ? { ...q.edges[e] } : { type: "side", d: null, manualType: false };
    q.edges.splice(e + 1, 0, s);
    q.streets = q.streets.flatMap(i => (i < e ? [i] : i === e ? [e, e + 1] : [i + 1]));
  }
  return done(q);
}
/** حذف رأس: الضلعان حوله يندمجان ويأخذان إعدادات الضلع السابق */
export function deleteVertex(p: Project, i: number) {
  const n = p.parcel.vertices.length; if (p.parcel.closed && n <= 3) return p;
  const q = clone(p); q.parcel.vertices.splice(i, 1);
  if (q.parcel.closed) {
    q.edges.splice(i, 1);
    q.streets = q.streets.filter(k => k !== i).map(k => (k > i ? k - 1 : k));
  }
  return done(q);
}
export function setVertices(p: Project, pts: Array<[number, number]>, closed = true, source = "") {
  const q = clone(p); q.parcel.vertices = pts.map(([x, y]) => ({ x, y })); q.parcel.closed = closed && pts.length >= 3;
  q.edges = []; q.streets = []; if (source) q.crs.source = source; return done(q);
}
/** الضغط على ضلع شارع يضيفه أو يزيله، ثم يعاد تصنيف باقي الأضلاع */
export function toggleStreet(p: Project, i: number) {
  const q = clone(p); const s = new Set(q.streets); s.has(i) ? s.delete(i) : s.add(i); q.streets = [...s];
  if (q.edges[i]) q.edges[i].manualType = false;
  return done(q);
}
export function setEdgeType(p: Project, i: number, type: EdgeType) {
  const q = clone(p); if (!q.edges[i]) return p;
  if (type === "front") { if (!q.streets.includes(i)) q.streets.push(i); q.edges[i].manualType = false; }
  else { q.streets = q.streets.filter(k => k !== i); q.edges[i] = { ...q.edges[i], type, manualType: true }; }
  return done(q);
}
export function setEdgeD(p: Project, i: number, d: number | null) { const q = clone(p); if (!q.edges[i]) return p; q.edges[i].d = d; return done(q); }
export function resetAutoTypes(p: Project) { const q = clone(p); q.edges.forEach(e => (e.manualType = false)); return done(q); }
export function setRules(p: Project, patch: Partial<Rules>) { const q = clone(p); q.rules = { ...q.rules, ...patch }; return done(q); }
export function rename(p: Project, name: string) { const q = clone(p); q.name = name; return done(q); }
export function setMeta(p: Project, patch: Partial<Project["meta"]>) { const q = clone(p); q.meta = { ...q.meta, ...patch }; return done(q); }
